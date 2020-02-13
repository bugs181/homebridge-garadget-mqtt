'use strict'

let Service, Characteristic
const mqtt = require('mqtt')

// Alternative Homebridge plugin to:
// https://github.com/xNinjasx/homebridge-garadget

// Support thread:
// https://community.garadget.com/t/introducing-garadget-integration-for-homebridge-using-mqtt

// Github repo:
// https://github.com/bugs181/homebridge-garadget-mqtt

// npm repo:
// https://www.npmjs.com/package/homebridge-garadget-mqtt


module.exports = function(homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic

  homebridge.registerPlatform("homebridge-garadget-mqtt", "GaradgetMQTT", garadgetPlatform)
}

function garadgetPlatform(log, config) {
  this.log = log
  this.config = config
}

garadgetPlatform.prototype = {
  accessories: function(callback) {

    const client = mqtt.connect(this.config.mqtt_server, {
      username: this.config.mqtt_user,
      password: this.config.mqtt_pass,
    })

    client.on('connect', () => {

      // For each device listed in config, create a Homebridge accessory
      const cfgAccessories = this.config.accessories
      const hbAccessories = []

      for (let cfgAccessory of cfgAccessories) {
        var accessory = new GaradgetAccessory(client, this.log, cfgAccessory)
        hbAccessories.push(accessory)

        this.log('Created \'' + accessory.name + '\' Accessory')
      }

      callback(hbAccessories)

    })
  }
}

function GaradgetAccessory(client, log, config) {
  this.client = client
  this.log = log
  this.config = config
  this.name = config.name

  // Set up topics for Garadget
  this.statusTopic = config.statusTopic
  this.commandTopic = config.commandTopic

  this.lastGarageState = Characteristic.CurrentDoorState.CLOSED
  this.lastTargetState = Characteristic.TargetDoorState.CLOSED

  client.on('message', (_, data) => {
    try {
      const message = JSON.parse(data)
      this.log(this.name + ' door is', message.status)
      updateGarageDoorState.call(this, message)
    } catch (err) {
      this.log('Error: ' + this.name + ' encountered an error processing data.')
    }
  })

  client.subscribe(this.statusTopic, (err) => {
    if (err)
      return this.log('Error:', err)

    this.log('Subscribed to ' + this.name + ' door status channel')
  })
}

GaradgetAccessory.prototype = {
  getServices: function() {
    const informationService = new Service.AccessoryInformation()
    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Garadget')
      .setCharacteristic(Characteristic.Model, "Photon")
      .setCharacteristic(Characteristic.Name, this.name)

    this.informationService = informationService

    const garageService = new Service.GarageDoorOpener(this.name)
    garageService
      .getCharacteristic(Characteristic.CurrentDoorState)
      .on('get', this.getCurrentState.bind(this))

    garageService
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('get', this.getTargetState.bind(this))
      .on('set', this.setTargetState.bind(this))

    garageService
      .getCharacteristic(Characteristic.ObstructionDetected)
      .on('get', this.obDetected.bind(this))

    this.garageService = garageService

    return [informationService, garageService]
  },

  getCurrentState: function(callback) {
    this.log('Get ' + this.name + ' door status')
    this.client.publish(this.commandTopic, 'get-status')

    callback(null, this.lastGarageState)
  },

  getTargetState: function(callback) {
    callback(null, this.lastTargetState)
  },

  setTargetState: function(state, callback) {
    let newDoorState
    switch (state) {
      case Characteristic.TargetDoorState.OPEN:
        newDoorState = 'open'
        break

      case Characteristic.TargetDoorState.CLOSED:
        newDoorState = 'close'
        break

      default:
        this.log('Error setting ' + this.name + ' door state to unknown:', state)
        break
    }

    this.log('Set ' + this.name + ' door state to %s', newDoorState)
    this.client.publish(this.commandTopic, newDoorState)
    this.lastTargetState = newDoorState

    callback(null)
  },

  obDetected: function(callback) {
    callback(null, 0)
  }
}

function updateGarageDoorState(message) {
  const state = message.status

  switch (state) {
    case 'open':
      this.lastGarageState = Characteristic.CurrentDoorState.OPEN
      break
    case 'closed':
      this.lastGarageState = Characteristic.CurrentDoorState.CLOSED
      break
    case 'opening':
      this.lastGarageState = Characteristic.CurrentDoorState.OPENING
      break
    case 'closing':
      this.lastGarageState = Characteristic.CurrentDoorState.CLOSING
      break
    case 'stopped':
      this.lastGarageState = Characteristic.CurrentDoorState.STOPPED
      break
    default:
      this.log('Error retrieving door state of unknown:', state)
      break
  }

  this.garageService
    .setCharacteristic(Characteristic.CurrentDoorState, this.lastGarageState)
}
