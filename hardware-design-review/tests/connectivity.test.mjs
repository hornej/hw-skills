import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectConnectivity, compareMembership, sha256 } from '../scripts/inspect_connectivity.mjs';
import { makeProject, schdoc, simpleRecords } from './altium-fixture.mjs';

async function fixture(t, extra = '') {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hw-connectivity-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, design: await makeProject(dir, extra) };
}

const annotationRow = (n, { logical='R1', physical='R23', document='Main.SchDoc', channel='main.schdoc', uid='COMP0002', part='1' } = {}) =>
  `LogicalDesignator${n}=${logical}\nLogicalPartID${n}=${part}\nDocumentName${n}=${document}\nChannelName${n}=${channel}\nUniqueID${n}=\\${uid.replaceAll('/', '\\')}\nPhysicalDesignator${n}=${physical}\n`;

test('declared physical annotation is applied by UID and hashed', async t => {
  const { dir, design } = await fixture(t, '[Document2]\nDocumentPath=Physical.Annotation\n');
  const annotation = path.join(dir, 'Physical.Annotation');
  await writeFile(annotation, '[DesignatorManager]\n' + annotationRow(0));
  const report = await inspectConnectivity(design);
  assert.equal(report.coverage.physical_instance_mapping, 'saved_annotation_and_channel_identity');
  assert.deepEqual(report.findings, []);
  assert.equal(report.sources.find(s => s.path === annotation).sha256, sha256(await readFile(annotation)));
  assert.ok(report.connections.some(c => c.refdes === 'R23'));
  assert.ok(!report.components.R1);
  const cli = fileURLToPath(new URL('../scripts/inspect_connectivity.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--design', design, '--out', path.join(dir, 'report.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).findings, 0);
});

test('adjacent annotation is detected even when absent from project membership', async t => {
  const { dir, design } = await fixture(t);
  await writeFile(path.join(dir, 'Demo.Annotation'), '[DesignatorManager]\n' + annotationRow(0));
  const report = await inspectConnectivity(design);
  assert.ok(report.components.R23);
  assert.equal(report.physical_identities.find(p => p.refdes === 'R23').basis, 'saved_annotation_uid');
});

test('real parser extracts saved Altium pin membership and hashes every source', async t => {
  const { dir, design } = await fixture(t);
  const before = await readFile(path.join(dir, 'Main.SchDoc'));
  const report = await inspectConnectivity(design);
  assert.equal(report.engine.version, '1.14.4');
  assert.deepEqual(report.connections, [
    { refdes: 'J1', pin: '1', net: 'SIGNAL' },
    { refdes: 'J1', pin: '2', net: 'GND' },
    { refdes: 'R1', pin: '1', net: 'SIGNAL' },
  ]);
  assert.equal(report.sources.length, 2);
  assert.deepEqual(await readFile(path.join(dir, 'Main.SchDoc')), before);
  assert.equal(report.coverage.native_compile, 'not_run');
  assert.equal(report.coverage.native_membership_equivalence, 'not_verified');
});

test('missing sheet and corrupt document cannot yield a successful report', async t => {
  const { dir, design } = await fixture(t);
  await writeFile(path.join(dir, 'Main.SchDoc'), 'corrupt');
  await assert.rejects(inspectConnectivity(design));
  await rm(path.join(dir, 'Main.SchDoc'));
  await assert.rejects(inspectConnectivity(design));
});

test('one valid sheet cannot hide another missing or unsupported declared sheet', async t => {
  const { dir, design } = await fixture(t);
  const project = await readFile(design, 'utf8');
  await writeFile(design, project + '[Document2]\nDocumentPath=Missing.SchDoc\n');
  await assert.rejects(inspectConnectivity(design), /ENOENT/);
  await writeFile(path.join(dir, 'Missing.SchDoc'), 'not OLE');
  await assert.rejects(inspectConnectivity(design), /not a supported OLE/);
  await writeFile(design, project + '[Document2]\nDocumentPath=C:\\private\\Elsewhere.SchDoc\n');
  await assert.rejects(inspectConnectivity(design), /absolute SchDoc path/);
});

test('project with no declared sheets cannot silently scan neighboring files', async t => {
  const { design } = await fixture(t);
  await writeFile(design, '[Design]\n');
  await assert.rejects(inspectConnectivity(design), /declares no SchDoc/);
});

test('named variants require selection; unknown variants fail', async t => {
  const { design } = await fixture(t, '[ProjectVariant1]\nDescription=Assembly A\nVariationCount=0\n');
  await assert.rejects(inspectConnectivity(design), /variant/i);
  await assert.rejects(inspectConnectivity(design, 'wrong'), /variant/i);
  const report = await inspectConnectivity(design, 'Assembly A');
  assert.equal(report.design_variant, 'Assembly A');
});

test('variant DNP is retained with pins instead of silently removing coverage', async t => {
  const { design } = await fixture(t, '[ProjectVariant1]\nDescription=Assembly A\nVariationCount=1\n' +
    'Variation1=Designator=R1|UniqueId=\\COMP0002|Kind=1|AlternatePart= \n');
  const report = await inspectConnectivity(design, 'Assembly A');
  assert.equal(report.components.R1.dns, true);
  assert.ok(report.connections.some(row => row.refdes === 'R1'));
});

test('multi-part component pins merge under one reference without losing membership', async t => {
  const { dir, design } = await fixture(t);
  const records = [...simpleRecords,
    '|RECORD=1|UniqueID=COMP0001|CurrentPartId=2|LibReference=Connector|',
    '|RECORD=34|OwnerIndex=10|Text=J1|',
    '|RECORD=2|OwnerIndex=10|OwnerPartId=2|Designator=3|Location.X=100|Location.Y=200|PinLength=0|',
  ];
  await writeFile(path.join(dir, 'Main.SchDoc'), schdoc(records));
  const report = await inspectConnectivity(design);
  assert.equal(Object.keys(report.components).length, 2);
  assert.ok(report.connections.some(row => row.refdes === 'J1' && row.pin === '3' && row.net === 'GND'));
});

test('repeated child sheets retain distinct component identities and complete source hashes', async t => {
  const { dir, design } = await fixture(t);
  await writeFile(path.join(dir, 'Main.SchDoc'), schdoc([
    '|RECORD=15|UniqueID=SHEET001|',
    '|RECORD=32|OwnerIndex=0|Text=Repeat(CH,1,2)|',
    '|RECORD=33|OwnerIndex=0|Text=Child.SchDoc|',
  ]));
  await writeFile(path.join(dir, 'Child.SchDoc'), schdoc(simpleRecords));
  await writeFile(design, '[Design]\nNetIdentifierScope=1\n[Document1]\nDocumentPath=Main.SchDoc\n' +
    '[Document2]\nDocumentPath=Child.SchDoc\n');
  const report = await inspectConnectivity(design);
  assert.equal(Object.keys(report.components).length, 4);
  assert.equal(report.connections.length, 6);
  assert.equal(report.sources.length, 3);
  assert.equal(new Set(report.connections.map(row => row.refdes)).size, 4);
});

test('same membership counts do not hide a pin swap', () => {
  const expected = [{ refdes: 'J1', pin: '1', net: 'VCC' }, { refdes: 'J1', pin: '2', net: 'GND' }];
  const actual = [{ refdes: 'J1', pin: '1', net: 'GND' }, { refdes: 'J1', pin: '2', net: 'VCC' }];
  const result = compareMembership(actual, expected);
  assert.equal(result.status, 'different'); assert.equal(result.missing.length, 2); assert.equal(result.extra.length, 2);
  assert.throws(() => compareMembership(actual, []));
  assert.throws(() => compareMembership(actual, [expected[0], expected[0]]), /duplicate/);
});

test('comparison is scoped to source hash and variant', async t => {
  const { dir, design } = await fixture(t);
  const report = await inspectConnectivity(design);
  const comparison = path.join(dir, 'compiled-membership.json');
  const evidence = { source: 'Synthetic expected membership, not native Altium output',
    design_sha256: sha256(await readFile(design)), design_variant: report.design_variant, connections: report.connections };
  await writeFile(comparison, JSON.stringify(evidence));
  assert.equal((await inspectConnectivity(design, undefined, comparison)).comparison.status, 'matches_supplied_membership');
  await writeFile(comparison, JSON.stringify({ ...evidence, design_sha256: 'stale' }));
  await assert.rejects(inspectConnectivity(design, undefined, comparison), /design_sha256/);
});

test('CLI writes a report and refuses an existing output unchanged', async t => {
  const { dir, design } = await fixture(t);
  const script = fileURLToPath(new URL('../scripts/inspect_connectivity.mjs', import.meta.url));
  const out = path.join(dir, 'evidence.json');
  const args = [script, '--design', design, '--out', out];
  execFileSync(process.execPath, args);
  const before = await readFile(out);
  assert.equal(spawnSync(process.execPath, args).status, 2);
  assert.deepEqual(await readFile(out), before);
});

test('CLI also executes through an installed junction or directory symlink', async t => {
  const { dir, design } = await fixture(t);
  const skill = fileURLToPath(new URL('../', import.meta.url));
  const installed = path.join(dir, 'installed-skill');
  await symlink(skill, installed, 'junction');
  const out = path.join(dir, 'installed-report.json');
  const stdout = execFileSync(process.execPath, [path.join(installed, 'scripts/inspect_connectivity.mjs'),
    '--design', design, '--out', out], { encoding: 'utf8' });
  assert.equal(JSON.parse(stdout).pins, 3);
  assert.equal(JSON.parse(await readFile(out, 'utf8')).connections.length, 3);
});
