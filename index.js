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
  // App variables
  this.client = client
  this.log = log
  this.config = config
  this.name = config.name

  // Set up topics for Garadget
  this.statusTopic = config.statusTopic
  this.commandTopic = config.commandTopic

  // Set up a default state
  this.lastGarageState = Characteristic.CurrentDoorState.CLOSED
  this.lastTargetState = Characteristic.TargetDoorState.CLOSED
  this.lastLightState = 0

  // MQTT Message receive event (for channels that we're subscribed to)
  client.on('message', (_, data) => {
    try {
      const message = JSON.parse(data)
      this.log(this.name + ' door is', message.status)
      updateGarageDoorState.call(this, message)
    } catch (err) {
      this.log('Error: ' + this.name + ' encountered an error processing data.')
    }
  })

  // Subscribe to the status topic channel
  client.subscribe(this.statusTopic, (err) => {
    if (err)
      return this.log('Error:', err)

    this.log('Subscribed to ' + this.name + ' door status channel')
  })

  // Ask for the status every so often, 0 is disabled in config. (Time in config is in minutes)
  if (config.updateRequest && config.updateRequest !== 0) {
    this.updateRequest = config.updateRequest * 1000 * 60
    setInterval(() => this.client.publish(this.commandTopic, 'get-status'), this.updateRequest)
  }
}

GaradgetAccessory.prototype = {
  getServices: function() {
    const accessoryServices = []

    // Basic Homebridge Accessory Service
    const informationService = new Service.AccessoryInformation()
    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Garadget')
      .setCharacteristic(Characteristic.Model, "Photon")
      .setCharacteristic(Characteristic.Name, this.name)

    this.informationService = informationService
    accessoryServices.push(informationService)

    // Garage Door Opener Acessory Service
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
    accessoryServices.push(garageService)

    // Light Sensor Accessory Service
    if (this.config.lightSensor) {
      const lightSensorService = new Service.LightSensor(this.name + ' Light Sensor')
      lightSensorService
        .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .on('get', this.getLightState.bind(this))

      this.lightSensorService = lightSensorService
      accessoryServices.push(lightSensorService)
    }

    return accessoryServices
  },

  getCurrentState: function(callback) {
    // HomeKit client is asking for the state of the Garadget.
    this.log('Get ' + this.name + ' door status')
    this.client.publish(this.commandTopic, 'get-status')

    callback(null, this.lastGarageState)
  },

  getTargetState: function(callback) {
    // HomeKit client is asking for the state of the Garadget.
    callback(null, this.lastTargetState)
  },

  setTargetState: function(state, callback) {
    // HomeKit client is opening/closing the Garadget
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
  },

  getLightState: function(callback) {
    // HomeKit client is asking for the state of the Garadget.
    callback(null, this.lastLightState)
  }
}

function updateGarageDoorState(message) {
  // Update HomeKit/Homebridge state with new information.
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

  // Update Garage door state
  this.garageService
    .setCharacteristic(Characteristic.CurrentDoorState, this.lastGarageState)

  // If Light Sensor is enabled in config
  if (this.config.lightSensor) {
    this.lastLightState = message.bright

    // Update Light Sensor state
    this.lightSensorService
      .setCharacteristic(Characteristic.CurrentAmbientLightLevel, this.lastLightState)
  }
}
