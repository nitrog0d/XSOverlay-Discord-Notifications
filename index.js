const { Plugin } = require('powercord/entities');
const { getModule } = require('powercord/webpack');
const { inject, uninject } = require('powercord/injector');
const Settings = require('./Settings.jsx');
const dgram = require('dgram');

const { getChannel } = getModule([ 'getChannel' ], false);
const { getGuild } = getModule([ 'getGuild' ], false);

const blurple = '#7289da';

function sendToXSOverlay (data) {
  const server = dgram.createSocket('udp4');
  server.send(data, 42069, '127.0.0.1', () => {
    server.close();
  });
}

function messageTypeToBoostLevel (type) {
  switch (type) {
    case 9: return 1;
    case 10: return 2;
    case 11: return 3;
  }
}

function formatEmotes (content) {
  const matches = content.match(/<(a?:\w+:)\d+>/g);
  if (!matches) {
    return content;
  }

  for (const match of matches) {
    content = content.split(match).join(`:${match.split(':')[1]}:`);
  }

  return content;
}

function formatChannelMentions (content) {
  const matches = content.match(/<(#\d+)>/g);
  if (!matches) {
    return content;
  }

  for (const match of matches) {
    let channelId = match.split('<#')[1];
    channelId = channelId.substring(0, channelId.length - 1);
    content = content.split(match).join(`<b><color=${blurple}>#${getChannel(channelId).name}</color></b>`);
  }

  return content;
}

function formatMessage (channel, msg, author) {
  if (msg.attachments.length > 0) {
    return `Uploaded ${msg.attachments[0].filename}`;
  }

  let temp = msg.content;
  switch (msg.type) {
    // Who the fuck cares about i18n anyway
    case 0:
    case 19:
      break;
    case 1:
      return `<b>${author.username}</b> added <b>${msg.mentions[0].username}</b> to the group.`;
    case 2:
      return `<b>${author.username}</b> removed <b>${msg.mentions[0].username}</b> from the group.`;
    case 3:
      return `<b>${author.username}</b> started a call.`;
    case 4:
      return `<b>${author.username}</b> changed the channel name: <b>${msg.content}</b>`;
    case 5:
      return `<b>${author.username}</b> changed the channel icon.`;
    case 6:
      return `<b>${author.username}</b> pinned <b>a message</b> to this channel.`;
    case 7:
      return `<b>${author.username}</b> joined the guild.`;
    case 8:
      return `<b>${author.username}</b> just boosted the server!`;
    case 9:
    case 10:
    case 11:
      return `<b>${author.username}</b> just boosted the server! <b>${getGuild(msg.guild_id).name}</b> has achieved <b>Level ${messageTypeToBoostLevel(msg.type)}!</b>`;
    case 12:
      return `<b>${author.username}</b> has added <b>${msg.content}</b> notifications to this channel.`;
    case 14:
    case 15:
    case 20:
      return `Type of message (${msg.type}) not implemented. Please check yourself.`;
  }

  temp = temp.split('@everyone').join(`<b><color=${blurple}>@everyone</color></b>`);
  temp = temp.split('@here').join(`<b><color=${blurple}>@here</color></b>`);

  for (const mention of msg.mentions) {
    temp = temp.split(`<@${mention.id}>`).join(`<b><color=${blurple}>@${mention.username}</color></b>`);
    temp = temp.split(`<@!${mention.id}>`).join(`<b><color=${blurple}>@${mention.username}</color></b>`);
  }

  if (msg.mention_roles.length > 0) {
    const { roles } = getGuild(msg.guild_id);
    for (const roleId of msg.mention_roles) {
      const role = roles[roleId];
      temp = temp.split(`<@&${roleId}>`).join(`<b><color=#${parseInt(role.color).toString(16)}>@${role.name}</color></b>`);
    }
  }

  temp = formatEmotes(temp);
  temp = formatChannelMentions(temp);

  return temp;
}

function getUserFromRawRecipients (userId, recipients) {
  for (const recipient of recipients) {
    if (recipient.id === userId) {
      return recipient;
    }
  }
}

function formatGroupDmTitle (channel, msg, author) {
  if (channel.name !== '') {
    return `${author.username} (${channel.name})`;
  }
  let temp = '';
  for (const recipient of channel.recipients) {
    // please why does getUser has to be a promise
    // This is probably going to break. Fuck it for now.
    const { rawRecipients } = channel;
    rawRecipients.push(msg.author);
    temp += `${getUserFromRawRecipients(recipient, rawRecipients).username}, `;
  }
  temp = `(${temp.substring(0, temp.length - 2)})`;
  return temp;
}

function formatTitle (channel, msg, author) {
  switch (channel.type) {
    case 0:
    case 5:
    case 6:
      if (channel.parent_id) {
        const category = getChannel(channel.parent_id);
        return `${msg.member.nick ? msg.member.nick : author.username} (#${channel.name}, ${category.name})`;
      }
      return `${msg.member.nick ? msg.member.nick : author.username} (#${channel.name})`;
    case 1:
      return author.username;
    case 3:
      return `${author.username} ${formatGroupDmTitle(channel, msg, author)}`;
  }
}

function calculateHeight (content) {
  if (content.length <= 100) {
    return 100;
  } else if (content.length <= 200) {
    return 150;
  } else if (content.length <= 300) {
    return 200;
  }
  return 250;
}

module.exports = class XSOverlayDiscordNotifications extends Plugin {
  async startPlugin () {
    powercord.api.settings.registerSettings('xsoverlay-discord-notifications-settings', {
      category: this.entityID,
      label: 'XSOverlay Discord Notifications',
      render: Settings
    });

    const modules = await getModule([ 'makeTextChatNotification' ]);

    inject('xsoverlay-discord-notifications', modules, 'makeTextChatNotification', args => {
      const [ channel, msg, author ] = args;

      console.log(channel);
      console.log(msg);

      const formattedMessage = formatMessage(channel, msg, author);

      fetch(author.avatarURL).then(response => response.arrayBuffer()).then(buffer => {
        const data = JSON.stringify({
          messageType: 1,
          index: 0,
          timeout: parseFloat(this.settings.get('notificationTimeout', 5)),
          height: calculateHeight(formattedMessage),
          opacity: parseFloat(this.settings.get('notificationOpacity', 0.9)),
          volume: 0,
          audioPath: '',
          title: formatTitle(channel, msg, author),
          content: formattedMessage,
          useBase64Icon: true,
          icon: Buffer.from(buffer).toString('base64'),
          sourceApp: 'XSOverlay-Discord-Notifications'
        });

        sendToXSOverlay(data);
      });

      return args;
    }, true);
  }

  pluginWillUnload () {
    uninject('xsoverlay-discord-notifications');

    powercord.api.settings.unregisterSettings('xsoverlay-discord-notifications-settings');
  }
};
