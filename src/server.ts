import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { connectDb } from './config/db';
import { env } from './config/env';

async function bootstrap() {
  try {
    await connectDb();
    // eslint-disable-next-line no-console
    console.log('Connected to MongoDB');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }

  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(morgan('dev'));
  app.use(express.json());

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

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${env.port}`);
  });
}

void bootstrap();


