// SPDX-License-Identifier: Apache-2.0
// Variant selection follows Universal Netlist 1.14.4 service/load-netlist.js.
// See ../../THIRD_PARTY.md and ../../vendor/universal-netlist/LICENSE.
import { parseAltiumProject } from './project.mjs';
import { parseAltiumProjectVariants } from '../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/altium/project-variants.js';
import { DEFAULT_VARIANT, resolveVariantSelector, describeDefaultVariantRefusal } from '../../node_modules/@intelligentelectron/universal-netlist/dist/parsers/variants.js';

export async function loadAltiumProject(design, requested, files) {
  const variants = parseAltiumProjectVariants((await files.readFile(design)).toString('utf8'));
  const names = variants.map(v => ({ name: v.name }));
  const selector = requested?.trim();
  if (!selector && names.length) throw new Error(`Design defines design variants ${names.map(v => v.name).join(', ')}; select one explicitly`);
  const selection = selector ? resolveVariantSelector(names, selector) : { selected: DEFAULT_VARIANT };
  if (!selection) throw new Error(`Design variant '${selector}' not found`);
  if (selection.selected === DEFAULT_VARIANT && names.length) throw new Error(describeDefaultVariantRefusal(names));
  const result = await parseAltiumProject(design, { variant: selection.selected, context: { files } });
  return { ...result, design_variant: selection.selected, format: 'altium' };
}
