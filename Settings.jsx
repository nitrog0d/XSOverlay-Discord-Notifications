const { React } = require('powercord/webpack');
const { TextInput } = require('powercord/components/settings');

module.exports = class Settings extends React.Component {
  render () {
    return (
      <div>
        <TextInput
          note='The notification opacity (0.0 - 1.0)'
          defaultValue={this.props.getSetting('notificationOpacity', '0.9')}
          onChange={(value) => this.props.updateSetting('notificationOpacity', value)}
        >
          Notification opacity
        </TextInput>
        <TextInput
          note='How long it will take for the notification disappear'
          defaultValue={this.props.getSetting('notificationTimeout', '5')}
          onChange={(value) => this.props.updateSetting('notificationTimeout', value)}
        >
          Notification timeout
        </TextInput>
      </div>
    );
  }
};
