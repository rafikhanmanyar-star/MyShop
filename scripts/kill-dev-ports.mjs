#!/usr/bin/env node
import { DEV_PORTS, freeDevPorts } from './dev-ports.mjs';

freeDevPorts(DEV_PORTS);
console.log(`Freed dev ports and stopped orphaned dev Node processes: ${DEV_PORTS.join(', ')}`);
