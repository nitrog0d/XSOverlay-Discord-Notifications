const { Plugin } = require('powercord/entities');
const { getModule } = require('powercord/webpack');
const { inject, uninject } = require('powercord/injector');
const Settings = require('./Settings.jsx');
const dgram = require('dgram');

const { getChannel } = getModule([ 'getChannel' ], false);
const { getGuild } = getModule([ 'getGuild' ], false);

const blurple = '#7289da';
const booster = '#ff73fa';

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
  const matches = content.match(new RegExp('(<a?:\\w+:\\d+>)', 'g'));
  if (!matches) {
    return content;
  }

  for (const match of matches) {
    content = content.replace(new RegExp(`${match}`, 'g'), `:${match.split(':')[1]}:`);
  }

  return content;
}

function formatChannelMentions (content) {
  const matches = content.match(new RegExp('<(#\\d+)>', 'g'));
  if (!matches) {
    return content;
  }

  for (const match of matches) {
    let channelId = match.split('<#')[1];
    channelId = channelId.substring(0, channelId.length - 1);
    content = content.replace(new RegExp(`${match}`, 'g'), `<b><color=${blurple}>#${getChannel(channelId).name}</color></b>`);
  }

  return content;
}

function formatMessage (msg, author) {
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
      return `<b>${author.username}</b> joined the server.`;
    case 8:
      return `<b>${author.username}</b> just <b><color=${booster}boosted</color></b> the server!`;
    case 9:
    case 10:
    case 11:
      return `<b>${author.username}</b> just <b><color=${booster}boosted</color></b> the server! <b>${getGuild(msg.guild_id).name}</b> has achieved <b>Level ${messageTypeToBoostLevel(msg.type)}!</b>`;
    case 12:
      return `<b>${author.username}</b> has added <b>${msg.content}</b> notifications to this channel.`;
    case 14:
    case 15:
    case 20:
    default:
      return `Type of message (${msg.type}) not implemented. Please check yourself.`;
  }

  if (temp.length === 0 && msg.attachments.length > 0) {
    return `Uploaded ${msg.attachments[0].filename}`;
  }

  if (temp.length === 0 && msg.embeds > 0) {
    temp = msg.embeds[0].title;
  }

  temp = temp.replace(new RegExp('@everyone', 'g'), `<b><color=${blurple}>@everyone</color></b>`);
  temp = temp.replace(new RegExp('@here', 'g'), `<b><color=${blurple}>@here</color></b>`);

  for (const mention of msg.mentions) {
    temp = temp.replace(new RegExp(`<@!?${mention.id}>`, 'g'), `<b><color=${blurple}>@${mention.username}</color></b>`);
  }

  if (msg.mention_roles.length > 0) {
    const { roles } = getGuild(msg.guild_id);
    for (const roleId of msg.mention_roles) {
      const role = roles[roleId];
      temp = temp.replace(new RegExp(`<@&${roleId}>`, 'g'), `<b><color=#${parseInt(role.color).toString(16)}>@${role.name}</color></b>`);
    }
  }

  temp = formatEmotes(temp);
  temp = formatChannelMentions(temp);

  return temp.length !== 0 ? temp : 'Empty';
}

function clearMessage (content) {
  return content.replace(new RegExp('<[^>]*>', 'g'), '');
}

function getUserFromRawRecipients (userId, recipients) {
  for (const recipient of recipients) {
    if (recipient.id === userId) {
      return recipient;
    }
  }
}

function formatGroupDmTitle (channel, msg) {
  if (channel.name !== '') {
    return channel.name;
  }
  let temp = '';
  const recipients = [];
  recipients.push(...channel.rawRecipients);
  if (!recipients.filter(r => r.id === msg.author.id).length === 0) {
    recipients.push(msg.author);
  }
  for (const recipient of channel.recipients) {
    temp += `${getUserFromRawRecipients(recipient, recipients).username}, `;
  }
  return temp.substring(0, temp.length - 2);
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
      return `${author.username} (${formatGroupDmTitle(channel, msg)})`;
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

      const formattedMessage = formatMessage(msg, author);

      fetch(`https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=128`).then(response => response.arrayBuffer()).then(buffer => {
        const data = JSON.stringify({
          messageType: 1,
          index: 0,
          timeout: parseFloat(this.settings.get('notificationTimeout', 5)),
          height: calculateHeight(clearMessage(formattedMessage)),
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
