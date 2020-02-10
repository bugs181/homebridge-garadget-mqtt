# homebridge-garadget-mqtt
Garadget integration for Homebridge, using MQTT

# Installation:
` npm install homebridge-garadget-mqtt -g`

# Configuration:
```
{
  "platform": "GaradgetMQTT",

  "mqtt_server": "mqtt://10.0.1.30",
  "mqtt_user": "username",
  "mqtt_pass": "password",

  "accessories": [
      {
          "name": "Garadget",
          "statusTopic": "garadget/Garadget/status",
          "commandTopic": "garadget/Garadget/command"
      }
  ]
}
```
