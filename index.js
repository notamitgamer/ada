const {
    default: makeWASocket,
    makeCacheableSignalKeyStore, // Needed for auth keys if you're using state.keys
    // makeInMemoryStore, // Not needed if using useMultiFileAuthState
    useMultiFileAuthState, // <-- CORRECTLY IMPORTED NOW
    DisconnectReason // <-- ADDED THIS IMPORT
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const pino = require("pino");
const { exec } = require("child_process");
const fs = require("fs"); // Potentially used for fs.rmSync if uncommented
const qrcode = require("qrcode-terminal");

const logger = pino().child({ level: "silent" });

const runPythonScript = (text, sender, sock) => {
    exec(`python3 ai.py "${text}" "${sender}"`, (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Python Error:", error.message);
            return;
        }

        const reply = stdout.trim();
        if (reply) {
            sock.sendMessage(sender, { text: reply });
            console.log(`📤 To ${sender}: ${reply}`);
        } else {
            console.log("⚠️ No reply returned.");
        }
    });
};

async function startSock() {
    // This will create a folder named 'baileys_auth_info' in your project directory
    // to store session credentials. You only need to scan the QR code once.
    const { state, saveCreds } = await useMultiFileAuthState(
        "./baileys_auth_info",
    ); // Ensure this path is correct

    // You also need to import and use fetchLatestBaileysVersion if you want to use it
    // For simplicity, let's stick to the hardcoded version for now or add the import.
    // For now, removing fetchLatestBaileysVersion call as it's not imported:
    // const { version, isLatest } = await fetchLatestBaileysVersion();
    // console.log(
    //     `Using baileys version ${version}${isLatest ? "" : " (outdated)"}`,
    // );

    // Manually specify the version as per your previous working setup or latest stable
    const version = [6, 7, 18]; // Using the version you had previously
    console.log(`Using baileys version ${version.join('.')}`);


    const sock = makeWASocket({
        version, // Using the specified version
        logger: pino({ level: "silent" }),
        // printQRInTerminal: true, // This option is deprecated and should be handled via 'qr' in connection.update
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }).child({ level: 'silent' })),
        },
        browser: ["Ubuntu", "Chrome", "110.0.0.0"], // Browser details that show up in linked devices
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection === "close") {
            // Check the reason for disconnection
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (
                reason === DisconnectReason.badSession ||
                reason === DisconnectReason.loggedOut
            ) {
                console.log("Logged out. Please scan the QR code again.");
                // If you want to automatically delete the old session file on logout, uncomment the line below:
                // fs.rmSync('./baileys_auth_info', { recursive: true, force: true });
                startSock(); // Attempt to restart the connection
            } else {
                console.log("Connection closed. Reconnecting...");
                startSock(); // Attempt to reconnect for other reasons
            }
        } else if (qr) {
            // Display the QR code if available for new sessions
            qrcode.generate(qr, { small: true });
            console.log("Scan the QR code above to connect your WhatsApp bot.");
        } else if (connection === "open") {
            console.log("✅ WhatsApp bot is ready and running!");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        const msg = messages[0];
        // Ignore empty messages or messages sent by the bot itself
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        // Extract message text from various possible message types
        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption;

        // If no text content is found, ignore the message
        if (!text) return;

        console.log(`📥 From ${sender}: ${text}`);
        runPythonScript(text, sender, sock);
    });
}

// Start the bot
startSock();
