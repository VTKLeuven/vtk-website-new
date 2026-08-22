/**
 * De Collect&Go-mailbox één keer nakijken vanaf de commandline.
 *
 * Om de IMAP-instellingen te testen zonder de worker of een draaiende app:
 * `npm run collectengo:poll -w @vtk/logistiek`.
 */
import { collectEnGoImapConfig, pollCollectEnGoMailbox } from '../lib/collectengo/imap';

async function main() {
  const config = collectEnGoImapConfig();
  if (!config) {
    console.error('COLLECTENGO_IMAP_HOST/USER/PASSWORD ontbreken; er valt niets op te halen.');
    process.exitCode = 1;
    return;
  }
  console.info(`Mailbox ${config.user} (${config.mailbox}) op ${config.host}:${config.port}...`);
  const result = await pollCollectEnGoMailbox();
  console.info(
    `Bekeken: ${result.fetched}, nieuw: ${result.created}, bijgewerkt: ${result.replaced}, al gekend: ${result.skipped}.`
  );
  for (const error of result.errors) console.error(`  ! ${error}`);
  if (result.errors.length > 0) process.exitCode = 1;
}

void main();
