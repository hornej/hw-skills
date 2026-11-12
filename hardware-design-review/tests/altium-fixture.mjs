/** Independently authored synthetic OLE document, with only a regular FileHeader stream. */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export function schdoc(records) {
  const texts = ['|HEADER=Protel for Windows - Schematic Capture Binary File Version 5.0|', ...records];
  const chunks = texts.map(s => {
    const text = Buffer.from(s + '\0', 'utf8'), size = Buffer.alloc(4);
    size.writeUInt32LE(text.length); return Buffer.concat([size, text]);
  });
  const data = Buffer.concat(chunks);
  const sectors = Math.max(8, Math.ceil((data.length + 20) / 512));
  const stream = Buffer.alloc(sectors * 512);
  data.copy(stream);
  // An ignored record pads the stream beyond the OLE mini-stream threshold.
  const padding = Buffer.from('|RECORD=0|PAD=' + 'x'.repeat(stream.length - data.length - 18) + '\0');
  stream.writeUInt32LE(padding.length, data.length); padding.copy(stream, data.length + 4);
  const header = Buffer.alloc(512);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(header);
  header.writeUInt16LE(0x3e, 24); header.writeUInt16LE(3, 26); header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30); header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44); header.writeUInt32LE(1, 48); header.writeUInt32LE(4096, 56);
  header.writeUInt32LE(0xfffffffe, 60); header.writeUInt32LE(0xfffffffe, 68);
  for (let i = 76; i < 512; i += 4) header.writeUInt32LE(0xffffffff, i);
  header.writeUInt32LE(0, 76);
  const fat = Buffer.alloc(512, 0xff);
  fat.writeUInt32LE(0xfffffffd, 0); fat.writeUInt32LE(0xfffffffe, 4);
  for (let i = 0; i < sectors; i++) fat.writeUInt32LE(i === sectors - 1 ? 0xfffffffe : i + 3, (i + 2) * 4);
  const directory = Buffer.alloc(512);
  function entry(offset, name, type, start, size, child = 0xffffffff) {
    const text = Buffer.from(name + '\0', 'utf16le'); text.copy(directory, offset);
    directory.writeUInt16LE(text.length, offset + 64); directory[offset + 66] = type; directory[offset + 67] = 1;
    directory.writeUInt32LE(0xffffffff, offset + 68); directory.writeUInt32LE(0xffffffff, offset + 72);
    directory.writeUInt32LE(child, offset + 76); directory.writeUInt32LE(start, offset + 116);
    directory.writeUInt32LE(size, offset + 120);
  }
  entry(0, 'Root Entry', 5, 0xfffffffe, 0, 1); entry(128, 'FileHeader', 2, 2, stream.length);
  return Buffer.concat([header, fat, directory, stream]);
}

export const simpleRecords = [
  '|RECORD=1|UniqueID=COMP0001|CurrentPartId=1|LibReference=Connector|',
  '|RECORD=34|OwnerIndex=0|Text=J1|',
  '|RECORD=2|OwnerIndex=0|OwnerPartId=1|Designator=1|Name=SIGNAL|Location.X=100|Location.Y=100|PinLength=0|',
  '|RECORD=2|OwnerIndex=0|OwnerPartId=1|Designator=2|Location.X=100|Location.Y=200|PinLength=0|',
  '|RECORD=1|UniqueID=COMP0002|CurrentPartId=1|LibReference=Resistor|',
  '|RECORD=34|OwnerIndex=4|Text=R1|',
  '|RECORD=2|OwnerIndex=4|Designator=1|Location.X=200|Location.Y=100|PinLength=0|',
  '|RECORD=27|LocationCount=2|X1=100|Y1=100|X2=200|Y2=100|',
  '|RECORD=25|Text=SIGNAL|Location.X=100|Location.Y=100|',
  '|RECORD=17|Text=GND|Location.X=100|Location.Y=200|',
];

export async function makeProject(directory, extra = '') {
  await writeFile(path.join(directory, 'Main.SchDoc'), schdoc(simpleRecords));
  const project = path.join(directory, 'Demo.PrjPcb');
  await writeFile(project, '[Design]\nNetIdentifierScope=1\n[Document1]\nDocumentPath=Main.SchDoc\n' + extra);
  return project;
}
