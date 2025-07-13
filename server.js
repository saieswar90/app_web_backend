/*const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mqtt = require('mqtt');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const mqttClient = mqtt.connect("mqtt://broker.emqx.io");
const topicCache = {}; // Key: originalHomeId_deviceId → List of { room, relay }
const stateCache = {}; // Optional: to track latest states

mqttClient.on("connect", () => {
    console.log("Connected to MQTT");
    mqttClient.subscribe("home/+/+/+/+/control");
    mqttClient.subscribe("home/+/+/+/+/state");
});

mqttClient.on("message", (topic, message) => {
    const parts = topic.split("/");
    if (parts.length !== 6) return;

    const [, homeId, deviceId, room, relay, type] = parts;
    const key = `${homeId}_${deviceId}`;

    if (type === "control") {
        if (!topicCache[key]) topicCache[key] = [];

        const exists = topicCache[key].some(item => item.room === room && item.relay === relay);
        if (!exists) {
            topicCache[key].push({ room, relay });
            console.log(`Discovered relay: ${room}/${relay} under ${key}`);
        }
    }

    if (type === "state") {
        const stateKey = `${homeId}_${deviceId}_${room}_${relay}`;
        stateCache[stateKey] = message.toString();
    }
});

// Get relays for a device
app.get("/relays/:deviceId", (req, res) => {
    const originalHomeId = req.query.originalHomeId; // pass this from frontend if needed
    const key = `${originalHomeId}_${req.params.deviceId}`;
    const relays = topicCache[key] || [];
    res.json(relays);
});

// Control relay
app.post("/control", (req, res) => {
    const { deviceId, updateHomeId, room, relay, command } = req.body;
    const topic = `home/${updateHomeId}/${deviceId}/${room}/${relay}/control`;
    mqttClient.publish(topic, command);
    console.log(`Published ${command} to ${topic}`);
    res.json({ status: "OK", topic });
});

// Optional: Get latest relay states
app.get("/states/:deviceId", (req, res) => {
    const homeId = req.query.updateHomeId;
    const deviceId = req.params.deviceId;

    const result = {};
    Object.keys(stateCache).forEach(key => {
        if (key.startsWith(`${homeId}_${deviceId}_`)) {
            const shortKey = key.split(`${homeId}_${deviceId}_`)[1];
            result[shortKey] = stateCache[key];
        }
    });

    res.json(result);
});

const port = 3000;
app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
});
*/




/* saieswar
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mqtt = require('mqtt');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const mqttClient = mqtt.connect("mqtt://mqtt.platinumrobotics.com:1883", {
  username: "myteam",
  password: "MyTeam@2025",
});

const topicCache = {};
const stateCache = {};

const wss = new WebSocket.Server({ noServer: true });

// ✅ MQTT CONNECT
mqttClient.on("connect", () => {
  console.log("✅ Connected to MQTT broker");

  mqttClient.subscribe("home/+/+/+/control");
  mqttClient.subscribe("+/switch/+/state");
  mqttClient.subscribe("home/+/+/+/temperature/status"); // Subscribe for all temp updates
});

// ✅ MQTT MESSAGE HANDLER
mqttClient.on("message", (topic, message) => {
  const parts = topic.split("/");

  // ✅ Relay control topic: home/{homeId}/{deviceId}/{relay}/control
  if (parts.length === 5 && parts[0] === "home" && parts[4] === "control") {
    const [, homeId, deviceId, relay] = parts;
    const key = `${homeId}_${deviceId}`;
    if (!topicCache[key]) topicCache[key] = [];
    if (!topicCache[key].some(item => item.relay === relay)) {
      topicCache[key].push({ relay });
    }
    return;
  }

  // ✅ Relay state topic: {deviceId}/switch/{relay}/state
  if (parts.length === 4 && parts[1] === "switch" && parts[3] === "state") {
    const [deviceId, , relay] = parts;
    const value = message.toString();
    const key = `${deviceId}_${relay}`;
    stateCache[key] = value;

    const payload = {
      type: "state",
      deviceId,
      relay,
      value
    };

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });

    console.log(`📡 STATE: ${topic} = ${value}`);
    return;
  }

  // ✅ Temperature topic: home/{updateHomeId}/{deviceId}/{sensorX}/temperature/status
  if (
    parts.length === 6 &&
    parts[0] === "home" &&
    parts[5] === "status" &&
    parts[4] === "temperature"
  ) {
    const [, updateHomeId, deviceId, sensorName] = parts;
    const value = message.toString();

    const payload = {
      type: "temperature",
      updateHomeId,
      deviceId,
      chartTitle: sensorName,  // dynamic chart name from topic
      value,
      topic
    };

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });

    console.log(`🌡️ Temperature: ${topic} = ${value}`);
    return;
  }

  console.warn("⚠️ Unknown topic received:", topic);
});

// ✅ GET RELAYS
app.get("/relays/:deviceId", (req, res) => {
  const originalHomeId = req.query.originalHomeId;
  const key = `${originalHomeId}_${req.params.deviceId}`;
  res.json(topicCache[key] || []);
});

// ✅ CONTROL COMMAND
app.post("/control", (req, res) => {
  const { deviceId, updateHomeId, relay, command } = req.body;
  const topic = `home/${updateHomeId}/${deviceId}/${relay}/control`;

  console.log("🧭 CONTROL:", topic, command);

  mqttClient.publish(topic, command, { qos: 1 }, err => {
    if (err) return res.status(500).json({ status: "MQTT publish failed" });
    res.json({ status: "OK", topic });
  });
});

// ✅ GET CURRENT STATES
app.get("/states/:deviceId", (req, res) => {
  const deviceId = req.params.deviceId;
  const result = {};

  Object.keys(stateCache).forEach(key => {
    if (key.startsWith(`${deviceId}_`)) {
      const relay = key.split(`${deviceId}_`)[1];
      result[relay] = stateCache[key];
    }
  });

  res.json(result);
});

// ✅ APP BOOT: SEND HELLO TO ALL CONTROL RELAY TOPICS
app.post("/data", (req, res) => {
  const { deviceId, originalHomeId } = req.body;
  const key = `${originalHomeId}_${deviceId}`;
  const relays = topicCache[key];

  console.log("📥 BOOT DATA:", req.body);

  if (!relays || relays.length === 0) {
    console.warn(`⚠️ No relays found for ${key}`);
    return res.status(404).json({ status: "No relays found", key });
  }

  relays.forEach(({ relay }) => {
    const topic = `home/${originalHomeId}/${deviceId}/${relay}/control`;
    mqttClient.publish(topic, "HELLO", { qos: 1 }, err => {
      if (err) {
        console.error(`❌ Failed HELLO to ${topic}:`, err);
      } else {
        console.log(`📤 HELLO sent to ${topic}`);
      }
    });
  });

  res.json({
    status: "HELLO messages sent",
    deviceId,
    originalHomeId,
    relays: relays.map(r => r.relay),
  });
});

// ✅ RAW DEBUG ENDPOINT
app.post("/debug", (req, res) => {
  console.log("🛠️ Debug Data:", req.body);
  res.send("Logged");
});

// ✅ SERVER & WEBSOCKET INIT
const server = app.listen(3000, () => {
  console.log("🚀 Server running at http://localhost:3000");
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");
  ws.send(JSON.stringify({ event: 'connected' }));
});

*/


const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mqtt = require('mqtt');
const WebSocket = require('ws');

const app = express();

// ✅ Secure and flexible CORS setup
const corsOptions = {
  origin: '*', // You can replace '*' with ['http://localhost:3000', 'https://your-ngrok-url']
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: false
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// ✅ MQTT Client
const mqttClient = mqtt.connect("mqtt://mqtt.platinumrobotics.com:1883", {
  username: "myteam",
  password: "MyTeam@2025",
});

const topicCache = {};
const stateCache = {};

// ✅ WebSocket Server
const wss = new WebSocket.Server({ noServer: true });

// ✅ MQTT Connect
mqttClient.on("connect", () => {
  console.log("✅ Connected to MQTT broker");

  mqttClient.subscribe("home/+/+/+/control");
  mqttClient.subscribe("+/switch/+/state");
  mqttClient.subscribe("home/+/+/+/temperature/status");
});

// ✅ MQTT Message Handler
mqttClient.on("message", (topic, message) => {
  const parts = topic.split("/");

  // Relay control topic
  if (parts.length === 5 && parts[0] === "home" && parts[4] === "control") {
    const [, homeId, deviceId, relay] = parts;
    const key = `${homeId}_${deviceId}`;
    if (!topicCache[key]) topicCache[key] = [];
    if (!topicCache[key].some(item => item.relay === relay)) {
      topicCache[key].push({ relay });
    }
    return;
  }

  // Relay state topic
  if (parts.length === 4 && parts[1] === "switch" && parts[3] === "state") {
    const [deviceId, , relay] = parts;
    const value = message.toString();
    const key = `${deviceId}_${relay}`;
    stateCache[key] = value;

    const payload = {
      type: "state",
      deviceId,
      relay,
      value
    };

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });

    console.log(`📡 STATE: ${topic} = ${value}`);
    return;
  }

  // Temperature sensor topic
  if (
    parts.length === 6 &&
    parts[0] === "home" &&
    parts[5] === "status" &&
    parts[4] === "temperature"
  ) {
    const [, updateHomeId, deviceId, sensorName] = parts;
    const value = message.toString();

    const payload = {
      type: "temperature",
      updateHomeId,
      deviceId,
      chartTitle: sensorName,
      value,
      topic
    };

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });

    console.log(`🌡️ Temperature: ${topic} = ${value}`);
    return;
  }

  console.warn("⚠️ Unknown topic received:", topic);
});

// ✅ API: Get relays for device
app.get("/relays/:deviceId", (req, res) => {
  const originalHomeId = req.query.originalHomeId;
  const key = `${originalHomeId}_${req.params.deviceId}`;
  res.json(topicCache[key] || []);
});

// ✅ API: Control a relay
app.post("/control", (req, res) => {
  const { deviceId, updateHomeId, relay, command } = req.body;
  const topic = `home/${updateHomeId}/${deviceId}/${relay}/control`;

  console.log("🧭 CONTROL:", topic, command);

  mqttClient.publish(topic, command, { qos: 1 }, err => {
    if (err) return res.status(500).json({ status: "MQTT publish failed" });
    res.json({ status: "OK", topic });
  });
});

// ✅ API: Get current states
app.get("/states/:deviceId", (req, res) => {
  const deviceId = req.params.deviceId;
  const result = {};

  Object.keys(stateCache).forEach(key => {
    if (key.startsWith(`${deviceId}_`)) {
      const relay = key.split(`${deviceId}_`)[1];
      result[relay] = stateCache[key];
    }
  });

  res.json(result);
});

// ✅ API: App boot hello to all relays
app.post("/data", (req, res) => {
  const { deviceId, originalHomeId } = req.body;
  const key = `${originalHomeId}_${deviceId}`;
  const relays = topicCache[key];

  console.log("📥 BOOT DATA:", req.body);

  if (!relays || relays.length === 0) {
    console.warn(`⚠️ No relays found for ${key}`);
    return res.status(404).json({ status: "No relays found", key });
  }

  relays.forEach(({ relay }) => {
    const topic = `home/${originalHomeId}/${deviceId}/${relay}/control`;
    mqttClient.publish(topic, "HELLO", { qos: 1 }, err => {
      if (err) {
        console.error(`❌ Failed HELLO to ${topic}:`, err);
      } else {
        console.log(`📤 HELLO sent to ${topic}`);
      }
    });
  });

  res.json({
    status: "HELLO messages sent",
    deviceId,
    originalHomeId,
    relays: relays.map(r => r.relay),
  });
});

// ✅ Raw debug endpoint
app.post("/debug", (req, res) => {
  console.log("🛠️ Debug Data:", req.body);
  res.send("Logged");
});

// ✅ Server start and WebSocket upgrade
const server = app.listen(3000, () => {
  console.log("🚀 Server running at http://localhost:3000");
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");
  ws.send(JSON.stringify({ event: 'connected' }));
});
