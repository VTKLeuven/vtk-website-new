/**
 * One-time helper for configuring the VTK admin's Vaultwarden integration.
 *
 * It authenticates as the bot account using its personal API key, retrieves
 * the encrypted account and organization keys, and decrypts the selected
 * organization's 64-byte symmetric key locally. It never writes credentials
 * or keys to disk.
 *
 * Run from the repository root:
 *   npx tsx --conditions=react-server scripts/vault-bootstrap-org-key.ts
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import {
  decryptBytes,
  deriveMasterKey,
  rsaDecrypt,
  stretchMasterKey,
  type KdfParams,
} from '../apps/web/lib/vault/crypto';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Gebruik: npx tsx --conditions=react-server scripts/vault-bootstrap-org-key.ts');
  console.log('Vraagt interactief om de botaccountgegevens en schrijft geen geheimen naar schijf.');
  process.exit(0);
}

type Json = Record<string, unknown>;

function field<T = unknown>(value: unknown, name: string): T | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Json;
  return (record[name] ?? record[name[0].toUpperCase() + name.slice(1)]) as T | undefined;
}

async function secret(question: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('Dit script moet in een interactieve terminal draaien.');
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (text === '\r' || text === '\n') return done();
      if (text === '\u0003') {
        stdin.off('data', onData);
        stdin.setRawMode(false);
        stdout.write('\n');
        reject(new Error('Afgebroken.'));
        return;
      }
      if (text === '\u007f' || text === '\b') {
        value = value.slice(0, -1);
        return;
      }
      value += text;
    };
    stdin.on('data', onData);
  });
}

async function json(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${new URL(url).pathname} gaf ${response.status}.`);
  return body;
}

async function main() {
  const prompts = createInterface({ input: stdin, output: stdout });
  try {
    const rawUrl = await prompts.question('Vaultwarden URL [https://wachtwoorden.vtk.be]: ');
    const url = (rawUrl || 'https://wachtwoorden.vtk.be').replace(/\/+$/, '');
    const email = (await prompts.question('Botaccount e-mail: ')).trim().toLowerCase();
    const clientId = (await prompts.question('Persoonlijke API client_id (user.…): ')).trim();
    prompts.close();

    if (!email || !clientId.startsWith('user.')) {
      throw new Error('Vul het e-mailadres en een persoonlijke client_id die met user. begint in.');
    }

    const clientSecret = await secret('Persoonlijke API client_secret (verborgen): ');
    const password = await secret('Master password van het botaccount (verborgen): ');

    const prelogin = await json(`${url}/identity/accounts/prelogin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const kdf: KdfParams = {
      kdf: field<number>(prelogin, 'kdf') ?? 0,
      iterations: field<number>(prelogin, 'kdfIterations') ?? 0,
    };
    if (!kdf.iterations) throw new Error('Geen PBKDF2-instellingen van Vaultwarden gekregen.');

    const token = await json(`${url}/identity/connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'api',
        deviceType: '9',
        deviceIdentifier: '8e2e7997-2b4d-44de-92d1-431984b9041c',
        deviceName: 'vtk-vault-bootstrap',
      }).toString(),
    });
    const accessToken = field<string>(token, 'access_token');
    const encryptedUserKey = field<string>(token, 'key');
    const encryptedPrivateKey = field<string>(token, 'privateKey');
    if (!accessToken || !encryptedUserKey || !encryptedPrivateKey) {
      throw new Error('De login gaf geen account-crypto terug. Log opnieuw in via de webkluis en probeer opnieuw.');
    }

    const sync = await json(`${url}/api/sync`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        // Vaultwarden validates this for authenticated API calls. This is a
        // protocol version, not the installed server version.
        'Bitwarden-Client-Version': '2026.1.0',
        'Device-Type': '9',
      },
    });
    // `/api/sync` puts the organization's encrypted key under `Profile`.
    // Keep the top-level fallback for older Vaultwarden responses.
    const profile = field(sync, 'profile');
    const organizations = field<unknown[]>(profile, 'organizations') ?? field<unknown[]>(sync, 'organizations') ?? [];
    if (!organizations.length) throw new Error('Dit botaccount is nog eigenaar/lid van geen organisatie.');

    const choices = organizations.map((organization, index) => ({
      id: field<string>(organization, 'id'),
      name: field<string>(organization, 'name') ?? '(naamloos)',
      key: field<string>(organization, 'key'),
      index,
    }));
    choices.forEach(({ index, name, id }) => console.log(`${index + 1}. ${name} (${id ?? 'geen id'})`));
    const selection = await (async () => {
      const picker = createInterface({ input: stdin, output: stdout });
      try {
        return await picker.question(`Kies organisatie [1-${choices.length}]: `);
      } finally {
        picker.close();
      }
    })();
    const organization = choices[Number(selection) - 1];
    if (!organization?.id || !organization.key)
      throw new Error('Ongeldige keuze of de organisatie heeft geen sleutel.');

    const masterKey = deriveMasterKey(password, email, kdf);
    const userKey = decryptBytes(stretchMasterKey(masterKey), encryptedUserKey);
    const privateKey = decryptBytes(userKey, encryptedPrivateKey);
    const organizationKey = rsaDecrypt(privateKey, organization.key);
    if (organizationKey.length !== 64)
      throw new Error(`Organisatiesleutel is ${organizationKey.length} bytes, verwacht 64.`);

    console.log('\nPlak dit in Admin → IT:');
    console.log(`Organisation ID:  ${organization.id}`);
    console.log(`Organisation key: ${organizationKey.toString('base64')}`);
    console.log('\nBewaar deze uitvoer niet; de admin versleutelt de sleutel bij het opslaan.');
  } finally {
    prompts.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Onbekende fout.');
  process.exitCode = 1;
});
