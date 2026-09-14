#!/usr/bin/env node
// Creates the one owner account this system has. Deliberately not
// reachable through the application — there is no self-service signup.
// Run by a trusted operator with DATABASE_URL, same as migrate.mjs/seed.mjs.
//
// Usage: node db/createOwner.mjs <email> <password>
//
// Duplicates the scrypt scheme from src/password.ts (plain JS here, not a
// compiled import — see that file's comment). Keep the two in sync.
import { randomBytes, scryptSync } from 'node:crypto'
import pg from 'pg'

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node db/createOwner.mjs <email> <password>')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in, or export it directly.')
  process.exit(1)
}

function hashPassword(plain) {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, 64)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

const client = new pg.Client({ connectionString })
await client.connect()

try {
  const result = await client.query(
    `INSERT INTO owners (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, email`,
    [email, hashPassword(password)]
  )
  console.log('owner ready:', result.rows[0])
} finally {
  await client.end()
}
