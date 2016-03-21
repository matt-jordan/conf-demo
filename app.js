'use strict';

var ari = require('ari-client');
var Promise = require('bluebird');
var config = require('./config.json');

// Note: you should provide a config file (config.json) that
// has in it a JSON dictionary with the following:
//   appname - the name of the app (defaults to conf-demo)
//   uri - the URI of the Asterisk instance to connect to
//   username - the ARI user
//   password - the ARI user's password

var appname = config.appname || 'conf-demo';

ari.connect(config.uri, config.username, config.password)
.then(function (client) {

  var conference;

  function onDtmfReceived(event, channel) {
    if (event.digit !== '#') {
      return;
    }
    console.log('Channel %s has hit the big red button!', channel.name);

    client.bridges.get({bridgeId: conference.id})
      .then(function (updatedConference) {
        var randomChannel = Math.floor(Math.random() * updatedConference.channels.length);
        var prisonerId = updatedConference.channels[randomChannel];

        return client.channels.get({channelId: prisonerId});
      })
      .then(function (prisoner) {
        return prisoner.getChannelVar({variable: 'CALLERID(all)'})
          .then(function (variable) {
            console.log('Channel %s (%s) has been chosen for MONKEYS', variable.value, prisoner.name);

            prisoner.snoopChannel({whisper: 'out', app: appname});
          });
      });
  }

  function onStasisStart(event, channel) {
    var callerid;

    // Handle the evil Snoop channels whispering monkeys
    if (channel.name.substring(0, 5) === 'Snoop') {
      channel.play({media: 'sound:tt-monkeys'})
         .then(function (playback) {
            playback.on('PlaybackFinished', function () {
              channel.hangup();
            });
          });
      return;
    }

    // Not a Snoop channel; must be a normal participant
    channel.getChannelVar({variable: 'CALLERID(all)'})
      .then(function (variable) {
        callerid = variable.value;

        if (conference) {
          return Promise.resolve(conference);
        }
        return client.bridges.list()
          .then(function (bridges) {
            return Promise.filter(bridges, function (candidate) {
              return candidate.name === 'conf-demo';
            });
          })
          .then(function (candidates) {
            var candBridge = candidates[0];

            // Always use the same bridge, if it is available
            if (candBridge) {
              return Promise.resolve(candBridge);
            }
            return client.bridges.create({type: 'mixing,dtmf_events', name: 'conf-demo'})
              .then(function (newBridge) {
                candBridge = newBridge;
                return Promise.resolve(candBridge);
              });
          })
          .then(function (_conference) {
            conference = _conference;
            return Promise.resolve(conference);
          });
      })
      .then(function () {
        channel.on('ChannelDtmfReceived', onDtmfReceived);
        return channel.answer();
      })
      .then(function () {
        console.log('Add channel %s (%s) to the conference %s', callerid, channel.name, conference.name);
        return conference.addChannel({channel: channel.id});
      })
      .then(function () {
        return conference.play({media: 'sound:beep'});
      });
  }

  function onStasisEnd(event, channel) {
    console.log('Channel %s left the application!', channel.name);
  }

  client.on('StasisStart', onStasisStart);
  client.on('StasisEnd', onStasisEnd);

  console.log('Starting... ' + appname);
  client.start(appname);
})
.catch(function (err) {
  console.log(err);
});


