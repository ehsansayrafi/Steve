const Discord = require('discord.js');
const fs = require('fs');
const path = require("path");
const fetch = require('node-fetch');
const Query = require('mcquery/lib');
const mcping = require('mcping-js');
const auth = JSON.parse(fs.readFileSync(path.join(__dirname, "auth.json")));
const data = "env.json";
const prefix = '-mct ';
const invite = `https://discord.com/oauth2/authorize?client_id=${auth.clientid}&permissions=18432&scope=bot`

const client = new Discord.Client();
client.login(auth.nightly); // Bot authentication token

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Monitoring ${client.guilds.cache.size} servers.`);
    client.user.setPresence({ activity: { name: `${prefix}status | ${prefix}help`, type: 'LISTENING' }, status: 'online' })
        // .then(console.log)
        .catch(console.error);
});

client.on("guildCreate", (guild) => {
    // When the bot joins a server
    console.log(`Joined new guild: ${guild.id} (${guild.name})`);
    addGuildToData(guild);
    return;
});

client.on("guildDelete", (guild) => {
    // When the bot is kicked or guild is deleted
    console.log(`Left guild: ${guild.id} (${guild.name})`);

    // Remove server ID from env.json
    const env = JSON.parse(fs.readFileSync(path.join(__dirname, data)));
    const serverID = guild.id.toString();
    delete env[serverID];
    fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
    return;
});

client.on('message', message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return; // Check if message has bot prefix and message not sent by bot
    if (message.channel.type == "dm") return; // Ignore direct messages
    if (!message.guild.me.hasPermission("SEND_MESSAGES")) { // Check if send messages enabled
        console.log(`Server ${message.guild.id.toString()} (${message.guild.name}): No permission to send messages.`);
        return;
    }
    if (!message.guild.me.hasPermission("EMBED_LINKS")) { // Check if embed links enabled
        console.log(`Server ${message.guild.id.toString()} (${message.guild.name}): No permission to embed links.`);
        message.channel.send('Please enable the `Embed Links` permission for the Steve role in your Discord server settings!');
        return;
    }

    const serverID = message.guild.id.toString();
    console.log(`Server ${serverID} (${message.guild.name}) sent command`);
    try {
        var env = JSON.parse(fs.readFileSync(path.join(__dirname, data)));
    } catch (err) {
        console.log(`Failed to parse env.json: ${err}`);
        return;
    }
    if (!env[serverID]) addGuildToEnv(message.guild); // If guild ID not added to data file

    const commandBody = message.content.slice(prefix.length);
    const args = commandBody.split(' ');
    const command = args.shift().toLowerCase();

    if (command === 'help') {
        console.log(`Server ${serverID} (${message.guild.name}) sent help command`);

        // Create and send help embed
        const helpEmbed = new Discord.MessageEmbed()
            .setColor('#62B36F')
            .setAuthor('Steve', 'https://i.imgur.com/gb5oeQt.png')
            .setDescription(`Steve is a Discord bot for Minecraft communities!\nMake it easy to get your server IP and server status.`)
            .addFields(
                { name: 'Commands', value: `${prefix}help\n${prefix}setup\n${prefix}settings\n${prefix}status\n${prefix}ip\n${prefix}skin <user>\n${prefix}leave\n`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                { name: 'Description', value: 'Display this message\nDisplay setup instructions\nDisplay current settings\nGet the server status\nGet the server IP address\nGet a username\'s MC skin\nSteve will leave the server\n', inline: true },
            )
            .addField('Invite', `Invite me to your Discord server [here](${invite}).\u200B`)
            .setFooter('Made by Alienics 👾')
        message.channel.send(helpEmbed);
        return;
    }

    if (command === 'status') {
        console.log(`Server ${serverID} (${message.guild.name}) sent status command`);

        if (env[serverID].url == "") { // Check if URL in env.json
            return message.channel.send(`Your server IP has not been set up!  Please specify using \`${prefix}setup ip <SERVER IP>\`.`);
        }

        if (env[serverID].query) { // Grab server information using query if querying enabled
            // Create a new query using the server IP/port
            var query = new Query(env[serverID].url, env[serverID].port);

            // Sends a query request to the server IP/port
            query.connect()
                .then(() => {
                    query.full_stat((err, stat) => {
                        if (err) {
                            statusCheckFail(message, err);
                        }

                        try {
                            // Send a ping request to the server IP/port to grab server icon
                            const ping = new mcping.MinecraftServer(env[serverID].url, env[serverID].port);
                            ping.ping(4000, -1, (pingErr, res) => {

                                // Convert base64 favion to buffer and include as attachment if server icon exists
                                if (pingErr || !res.favicon) {
                                    var imgAttach = path.join(__dirname, "../assets/favicon.png");
                                } else {
                                    var image = Buffer.from(res.favicon.split(",")[1], 'base64');
                                    var imgAttach = new Discord.MessageAttachment(image, "favicon.png");
                                }

                                // Get player list
                                try {
                                    var playerList = 'No current players';
                                    if (stat.numplayers > 0 && stat.numplayers <= 20) {
                                        var playerList = ``;
                                        for (var i = 0; i < stat.numplayers; i++) {
                                            if (i % 4 == 0) {
                                                playerList += `\n`;
                                            }
                                            playerList += `${stat.player_[i]}, `;
                                        }
                                        playerList = playerList.substring(0, playerList.length - 2);
                                    } else if (stat.numplayers > 20) {
                                        var playerList = 'Too many to show!';
                                    }
                                } catch {
                                    console.log(`Server ${serverID} (${message.guild.name}): Player number does not match list`)
                                    if (stat.numplayers > 20) {
                                        var playerList = 'Too many to show!';
                                    } else {
                                        var playerList = 'Unknown';
                                    }
                                }

                                // Create and send server online embed
                                const statusEmbed = new Discord.MessageEmbed()
                                    .setColor('#2ECC71')
                                    .setTitle('Minecraft Server Status')
                                    .attachFiles([imgAttach])
                                    .addFields(
                                        { name: 'Status', value: `Online\n`, inline: true },
                                        { name: 'Version', value: `${stat.version}\n`, inline: true },
                                    )
                                    .setThumbnail('attachment://favicon.png')
                                    .addFields(
                                        { name: 'Players', value: `${stat.numplayers}/${stat.maxplayers}\n`, inline: true },
                                        { name: 'List', value: `${playerList}\n`, inline: true },
                                    )
                                    .setFooter(`${env[serverID].footer}`)
                                message.channel.send(statusEmbed);
                            })

                        } catch (err) {
                            statusCheckFail(message, err);
                        }
                        // Close query request when complete
                        if (query.outstandingRequests === 0) {
                            query.close()
                        }
                    });
                    return;
                })
                .catch(err => {
                    // Create and send server offline embed
                    offlineEmbed(message);
                    return;
                })
        } else { // Grab server information using ping if querying disabled
            try {
                // Send a ping request to the server IP/port to grab server icon
                const ping = new mcping.MinecraftServer(env[serverID].url, env[serverID].port);
                ping.ping(4000, -1, (pingErr, res) => {

                    // Send offline embed if ping error
                    if (pingErr) {
                        // Create and send server offline embed
                        offlineEmbed(message);
                        return;
                    }

                    // Convert base64 favion to buffer and include as attachment if server icon exists
                    if (!res.favicon) {
                        var imgAttach = path.join(__dirname, "../assets/favicon.png");
                    } else {
                        var image = Buffer.from(res.favicon.split(",")[1], 'base64');
                        var imgAttach = new Discord.MessageAttachment(image, "favicon.png");
                    }

                    // Get player list
                    try {
                        var playerList = 'No current players';
                        if (res.players.online > 20) {
                            var playerList = 'Too many to show!';
                        } else if (res.players.online > 0 && res.players.online <= 20) {
                            var playerList = ``;
                            for (var i = 0; i < res.players.online; i++) {
                                if (i % 4 == 0) {
                                    playerList += `\n`;
                                }
                                playerList += `${res.players.sample[i].name}, `;
                            }
                            playerList = playerList.substring(0, playerList.length - 2);
                        }
                    } catch {
                        console.log(`Server ${serverID} (${message.guild.name}): Player number does not match list`)
                        var playerList = 'Unknown';
                    }

                    // Create and send server online embed
                    const statusEmbed = new Discord.MessageEmbed()
                        .setColor('#2ECC71')
                        .setTitle('Minecraft Server Status')
                        .attachFiles([imgAttach])
                        .addFields(
                            { name: 'Status', value: `Online\n`, inline: true },
                            { name: 'Version', value: `${res.version.name}\n`, inline: true },
                        )
                        .setThumbnail('attachment://favicon.png')
                        .addFields(
                            { name: 'Players', value: `${res.players.online}/${res.players.max}\n`, inline: true },
                            { name: 'List', value: `${playerList}\n`, inline: true },
                        )
                        .setFooter(`${env[serverID].footer}`)
                    message.channel.send(statusEmbed);
                    return;
                })

            } catch (err) {
                console.log(`Failed to fetch server info: ${err}`);
                const fetchFailEmbed = new Discord.MessageEmbed()
                    .setColor('#E74C3C')
                    .setTitle('Failed to get server information')
                    .setDescription('Failed to get server information.  Please try again in a few minutes.')
                message.channel.send(fetchFailEmbed);
                return;
            }
        }

    }

    if (command === 'skin') {
        console.log(`Server ${serverID} (${message.guild.name}) sent skin command`);

        if (args.length == 0) {
            return message.channel.send(`You did not provide a username, ${message.author}!`);
        } else if (args.length > 1) {
            return message.channel.send(`Too many arguments provided! Please input only one username, ${message.author}`);
        }

        (async () => {
            // Get UUID from API
            const response = await fetch(`https://playerdb.co/api/player/minecraft/${args[0]}`,);
            try {
                var playerInfo = await response.json();
            } catch (err) {
                console.log(`Failed to fetch player skin: ${err}`);
                const fetchFailEmbed = new Discord.MessageEmbed()
                    .setColor('#E74C3C')
                    .setTitle('Failed to get player skin')
                    .setDescription('Failed to get player skin.  Please try again in a few minutes.')
                message.channel.send(fetchFailEmbed);
                return;
            }

            if (playerInfo.code === 'minecraft.api_failure') {
                return message.channel.send(`${args[0]} is not a valid Minecraft username, ${message.author}!`);
            }

            // Create and send skin grab embed
            const skinEmbed = new Discord.MessageEmbed()
                .setColor('#62B36F')
                .setTitle(`${playerInfo.data.player.username}'s Minecraft Skin`)
                .setThumbnail(`https://crafatar.com/renders/body/${playerInfo.data.player.id}?overlay=true`)
                .setImage(`https://crafatar.com/skins/${playerInfo.data.player.id}`)
                .addFields(
                    { name: 'Download', value: `To download this skin, click [here](https://minecraft.tools/download-skin/${playerInfo.data.player.username} "${playerInfo.data.player.username}'s skin").\n`, inline: true },
                )
            message.channel.send(skinEmbed);

        })();
        return;
    }

    if (command === 'ip' || command === 'join') { // Get server IP address
        console.log(`Server ${serverID} (${message.guild.name}) sent ip command`);

        // Display the port if not default
        let serverIP = `${env[serverID].url}:${env[serverID].port}`;
        if (env[serverID].port == "25565") {
            serverIP = `${env[serverID].url}`;
        }

        // Create and send join embed
        const joinEmbed = new Discord.MessageEmbed()
            .setColor('#62B36F')
            .setThumbnail(`https://eu.mc-api.net/v3/server/favicon/${env[serverID].url}`)
            .setTitle(`Join the Server`)
            .setDescription(`Join ${env[serverID].serverName} at **${serverIP}**!`)
        message.channel.send(joinEmbed);
        return;
    }

    if (command === 'setup') {
        console.log(`Server ${serverID} (${message.guild.name}) sent setup command`);

        if (!message.member.hasPermission("ADMINISTRATOR")) { // Check if author is admin
            const adminEmbed = new Discord.MessageEmbed()
                .setColor('#E74C3C')
                .setAuthor('Steve', 'https://i.imgur.com/gb5oeQt.png')
                .setDescription(`Only administrators can make changes to Steve!`)
            return message.channel.send(adminEmbed);
        }

        if (args.length == 0) { // Display setup instructions
            const setupEmbed = new Discord.MessageEmbed()
                .setColor('#62B36F')
                .setAuthor('Steve Setup Instructions', 'https://i.imgur.com/gb5oeQt.png')
                .setDescription(`Follow these commands to set Steve up for your server!`)
                .addField('Vanilla', '- In your `server.properties` file, set `enable-query` to `true`.\n- In `server.properties`, ensure `query.port` is the same as `server.port`.\n- Ensure the query port is port forwarded if not using server port.\n- Save and restart the server.')
                .addField('Bungeecord', '- In `config.yml`, set `query_enabled` to `true`.\n- In `config.yml`, ensure `query_port` is the same as server port (`host` port)\n- Ensure the query port is port forwarded if not using server port.\n- Save and restart the proxy.')
                .addFields(
                    { name: 'Commands', value: `${prefix}setup ip <Server IP>\n${prefix}setup port <Query Port>\n${prefix}setup name <Server name>\n${prefix}setup footer <Footer message>\n`, inline: true },
                    { name: 'Description', value: 'Set the server IP (IP or URL accepted)\nSet the server port (Default 25565)\nSet your server name\nSet a footer message\n', inline: true },
                    { name: 'Unable to use Query', value: `If you cannot enable query on your server, run \`${prefix}setup query <enable|disable>\` to enable or disable querying.  When query is disabled, Steve will instead use server pinging.  Note that this may break some functionality (Player list will not be shown on Bungeecord servers).` },
                    { name: 'Note', value: 'Remove the `<` and the `>` when using the setup commands.' }
                )
            return message.channel.send(setupEmbed);
        }

        if (args[0] === 'query') { // Enable or disable query
            try {
                if (args[1] === 'enable') {
                    env[serverID].query = true;
                    fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
                    console.log(`Successfully enabled query for server ${serverID} (${message.guild.name})`);
                    return message.channel.send(`Server querying enabled!  Query will be used instead of ping.`);
                } else if (args[1] === 'disable') {
                    env[serverID].query = false;
                    fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
                    console.log(`Successfully disabled query for server ${serverID} (${message.guild.name})`);
                    return message.channel.send(`Server querying disabled!  Server pinging will be used instead.`);
                } else {
                    console.log(`\x1b[31m\x1b[1mError setting query to ${args[1]} for server ${serverID} (${message.guild.name}):\x1b[0m`);
                    return message.channel.send(`Error changing query!  Ensure you are using \`-mc setup query enable\` or \`-mc setup query disable\`.`);
                }
            }
            catch (err) {
                console.log(`\x1b[31m\x1b[1mError setting query to ${args[1]} for server ${serverID} (${message.guild.name}):\x1b[0m`);
                console.log(err);
                return message.channel.send(`Error changing query!  Ensure you are using \`-mc setup query enable\` or \`-mc setup query disable\`.`);
            }
        }

        if (args[0] === 'ip') { // Setup IP address / URL

            if (args[1] == undefined) { // Check if argument included
                const noArgEmbed = new Discord.MessageEmbed()
                    .setColor('#E74C3C')
                    .setTitle(`No IP Specified`)
                    .setDescription(`No IP was specified!  No changes have been made.`)
                return message.channel.send(noArgEmbed);
            }

            const privateIPEmbed = new Discord.MessageEmbed()
                .setColor('#E74C3C')
                .setTitle('Invalid IP Address')
                .setDescription('The IP address entered is a private IP address! This means that I cannot reach your server. To continue, please port forward your server query port, and use your public IP address instead.  No changes to your settings have been made.')

            // Check if private IP address
            if (args[1].startsWith("192.168.") || args[1].startsWith("10.")) {
                console.log(`\x1b[31m\x1b[1mError setting IP for server ${serverID} (${message.guild.name}):  Private IP address\x1b[0m`);
                return message.channel.send(privateIPEmbed);
            }
            if (args[1].startsWith("172.")) {
                for (i = 16; i <= 31; i++) {
                    if (args[1].startsWith(`172.${i}`)) {
                        console.log(`\x1b[31m\x1b[1mError setting IP for server ${serverID} (${message.guild.name}):  Private IP address\x1b[0m`);
                        return message.channel.send(privateIPEmbed);
                    }
                }
            }

            try {
                // Get IP address from argument and send to JSON
                env[serverID].url = args[1];
                fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
                console.log(`Successfully set up IP for server ${serverID} (${message.guild.name})`);
                return message.channel.send(`Server IP of \`${args[1]}\` successfully set!`);
            }
            catch (err) {
                console.log(`\x1b[31m\x1b[1mError setting IP for server ${serverID} (${message.guild.name}):\x1b[0m`);
                console.log(err);
                return message.channel.send(`Error setting IP!`);
            }
        }

        if (args[0] === 'port') { // Setup server port

            if (args[1] == undefined) { // Check if argument included
                const noArgEmbed = new Discord.MessageEmbed()
                    .setColor('#E74C3C')
                    .setTitle(`No Port Specified`)
                    .setDescription(`No port was specified!  No changes have been made.`)
                return message.channel.send(noArgEmbed);
            }

            try {
                // Get IP address from argument and send to JSON
                env[serverID].port = args[1];
                fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
                console.log(`Successfully set up port for server ${serverID} (${message.guild.name})`);
                return message.channel.send(`Server port of \`${args[1]}\` successfully set!`);
            }
            catch (err) {
                console.log(`\x1b[31m\x1b[1mError setting port for server ${serverID} (${message.guild.name}):\x1b[0m`);
                console.log(err);
                return message.channel.send(`Error setting port!`);
            }
        }

        if (args[0] === 'name') { // Setup server name

            if (args[1] == undefined) { // Check if argument included
                const noArgEmbed = new Discord.MessageEmbed()
                    .setColor('#E74C3C')
                    .setTitle(`No Name Specified`)
                    .setDescription(`No name was specified!  No changes have been made.`)
                return message.channel.send(noArgEmbed);
            }

            try {
                // Get server name from arguments
                var name = ``;
                for (i = 1; i < args.length; i++) {
                    name += `${args[i]} `;
                }
                name = name.substring(0, name.length - 1);
                // Send server name to JSON and return
                env[serverID].serverName = name;
                fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
                console.log(`Successfully set up name for server ${serverID} (${message.guild.name})`);
                return message.channel.send(`Server name of \`${name}\` successfully set!`);
            }
            catch (err) {
                console.log(`\x1b[31m\x1b[1mError setting name for server ${serverID} (${message.guild.name}):\x1b[0m`);
                console.log(err);
                return message.channel.send(`Error setting name!`);
            }
        }

        if (args[0] === 'footer') { // Setup footer

            if (args[1] == undefined) { // Check if argument included
                const noArgEmbed = new Discord.MessageEmbed()
                    .setColor('#E74C3C')
                    .setTitle(`No Footer Specified`)
                    .setDescription(`No footer was specified!  No changes have been made.`)
                return message.channel.send(noArgEmbed);
            }

            try {
                // Get footer message from arguments
                var footerMessage = ``;
                for (i = 1; i < args.length; i++) {
                    footerMessage += `${args[i]} `;
                }
                footerMessage = footerMessage.substring(0, footerMessage.length - 1);
                // Send footer to JSON and return
                env[serverID].footer = footerMessage;
                fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
                console.log(`Successfully set up footer for server ${serverID} (${message.guild.name})`);
                return message.channel.send(`Server footer of \`${footerMessage}\` successfully set!`);
            }
            catch (err) {
                console.log(`\x1b[31m\x1b[1mError setting footer for server ${serverID} (${message.guild.name}):\x1b[0m`);
                console.log(err);
                return message.channel.send(`Error setting footer!`);
            }
        }
    }

    if (command === 'leave') {
        console.log(`Server ${serverID} (${message.guild.name}) sent leave command`);
        if (!message.member.hasPermission("ADMINISTRATOR")) { // Check if author is admin
            const adminEmbed = new Discord.MessageEmbed()
                .setColor('#E74C3C')
                .setAuthor('Steve', 'https://i.imgur.com/gb5oeQt.png')
                .setDescription(`Only administrators can make changes to Steve!`)
            return message.channel.send(adminEmbed);
        }
        (async () => {
            // Send leave embed
            const leaveEmbed = new Discord.MessageEmbed()
                .setColor('#62B36F')
                .setAuthor('Steve', 'https://i.imgur.com/gb5oeQt.png')
                .setDescription(`Goodbye! Click [here](${invite}) to invite me again.`)
            await message.channel.send(leaveEmbed);
            // Delete server properties from JSON and leave guild
            delete env[serverID];
            fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
            console.log(`Left guild: ${message.guild.id} (${message.guild.name})`);
            message.guild.leave();
        })();
        return;
    }

    if (command === 'settings') {
        console.log(`Server ${serverID} (${message.guild.name}) sent settings command`);
        if (!message.member.hasPermission("ADMINISTRATOR")) { // Check if author is admin
            const adminEmbed = new Discord.MessageEmbed()
                .setColor('#E74C3C')
                .setAuthor('Steve', 'https://i.imgur.com/gb5oeQt.png')
                .setDescription(`Only administrators can make changes to Steve!`)
            return message.channel.send(adminEmbed);
        }

        let serverName = env[serverID].serverName;
        let serverPort = env[serverID].port;
        let serverQuery = env[serverID].query;
        let serverURL = env[serverID].url;
        let serverFooter = env[serverID].footer;

        if (serverQuery) {
            serverQuery = "Enabled";
        } else if (!serverQuery) {
            serverQuery = "Disabled";
        }

        // If guild not set up
        if ((serverName == "") && (serverURL == "") && (serverFooter == "")) {
            const noSettingsEmbed = new Discord.MessageEmbed()
                .setColor('#E74C3C')
                .setAuthor('Current Settings', 'https://i.imgur.com/gb5oeQt.png')
                .setDescription(`Steve has not been set up on this server yet! Run \`${prefix}setup\` continue.`)
            return message.channel.send(noSettingsEmbed);
        }

        // Else display current settings
        if (serverName == "") { serverName = "None"; }
        if (serverURL == "") { serverURL = "None"; }
        if (serverFooter == "") { serverFooter = "None"; }
        const settingsEmbed = new Discord.MessageEmbed()
            .setColor('#62B36F')
            .setAuthor('Current Settings', 'https://i.imgur.com/gb5oeQt.png')
            .addFields(
                { name: 'Server', value: `${serverName}`, inline: true },
                { name: 'IP address', value: `${serverURL}`, inline: true },
                { name: 'Port', value: `${serverPort}`, inline: true },
                { name: 'Query', value: `${serverQuery}`, inline: true },
                { name: 'Footer', value: `${serverFooter}`, inline: true },
            )
        message.channel.send(settingsEmbed);
        return;
    }

});

function statusCheckFail(message, err) {
    console.log(`Failed to fetch server info: ${err}`);
    const fetchFailEmbed = new Discord.MessageEmbed()
        .setColor('#E74C3C')
        .setTitle('Failed to get server information')
        .setDescription('Failed to get server information.  Please try again in a few minutes.')
    message.channel.send(fetchFailEmbed);
    return;
}

function offlineEmbed(message) {
    // Create and send server offline embed
    const statusEmbed = new Discord.MessageEmbed()
        .setColor('#E74C3C')
        .setTitle('Server Status')
        .addFields(
            { name: 'Status', value: `Offline\n`, inline: true },
            { name: 'Version', value: `Unkown\n`, inline: true },
        )
        .addFields(
            { name: 'Players', value: `None\n`, inline: true },
        )
    message.channel.send(statusEmbed);
    return;
}

function addGuildToData(guild) {
    // Add server ID to data file
    const env = JSON.parse(fs.readFileSync(path.join(__dirname, data)));
    const serverID = guild.id.toString();
    var newGuild = { prefix: `${prefix}`, query: true, url: "", port: "25565", serverName: "", footer: "" };
    env[serverID] = newGuild;
    fs.writeFileSync(path.join(__dirname, data), JSON.stringify(env));
    return;
}
