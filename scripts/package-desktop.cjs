/* Reconstructed build entry; desktop/main.cjs was recovered unchanged. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bundled = '/home/sakauma/data/miniconda3/envs/agileagent/bin/python';
const python = process.env.SUDOKU_PYTHON || (fs.existsSync(bundled) ? bundled : 'python3');
const result = spawnSync(python, [path.join(__dirname, 'package-release.py'), '--desktop', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
