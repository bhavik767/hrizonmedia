// Any setup scripts you might need go here

// Keep integration tests independent from developer and production credentials.
import { config } from 'dotenv'

config({ path: 'test.env' })
