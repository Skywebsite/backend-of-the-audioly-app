"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const db_1 = require("./config/db");
const env_1 = require("./config/env");
async function bootstrap() {
    try {
        await (0, db_1.connectDb)();
        // eslint-disable-next-line no-console
        console.log('Connected to MongoDB');
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    }
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use((0, helmet_1.default)());
    app.use((0, morgan_1.default)('dev'));
    app.use(express_1.default.json());
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    // API routes
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    app.use('/auth', require('./routes/auth').default);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    app.use('/users', require('./routes/users').default);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    app.use('/songs', require('./routes/songs').default);
    app.listen(env_1.env.port, '0.0.0.0', () => {
        // eslint-disable-next-line no-console
        console.log(`Server listening on http://0.0.0.0:${env_1.env.port}`);
        // eslint-disable-next-line no-console
        console.log(`Access from network: http://<your-local-ip>:${env_1.env.port}`);
    });
}
void bootstrap();
