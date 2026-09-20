import fs from 'node:fs';
import { convex } from './global-setup';

export default async function teardown() {
  try {
    if (fs.existsSync('test-results/users.json')) {
      const userIds = JSON.parse(fs.readFileSync('test-results/users.json', 'utf8'));
      convex('run', 'testing:removeUsers', JSON.stringify({ userIds }));
    }
  } finally {
    convex('env', 'remove', 'DATE_NOTES_E2E_ENABLED');
    for (const file of ['users.json', 'user-0.json', 'user-1.json', 'user-2.json', 'user-3.json'])
      fs.rmSync(`test-results/${file}`, { force: true });
  }
}
