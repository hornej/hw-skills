const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');

test('categories distinguish passives from ICs, connectors and other component families',()=>{
  const cases=[
    [['Capacitors','Ceramic Capacitors'],'passives'],
    [['Resistors','Chip Resistor - Surface Mount'],'passives'],
    [['Inductors, Coils, Chokes','Fixed Inductors'],'passives'],
    [['Filters','Ferrite Beads and Chips'],'passives'],
    [['Integrated Circuits (ICs)','Data Acquisition','Digital Potentiometers'],'ics'],
    [['Semiconductors','Interface ICs','USB Interface IC'],'ics'],
    [['Semiconductors','Power Management ICs','Switched Capacitor Converters'],'ics'],
    [['Discrete Semiconductor Products','Transistors','Single FETs, MOSFETs'],'discretes'],
    [['Connectors, Interconnects','Rectangular Connectors','Headers, Male Pins'],'connectors'],
    [['Connectors, Interconnects','Sockets for ICs, Transistors'],'connectors'],
    [['Relays','Power Relays, Over 2 Amps'],'electromechanical'],
    [['Sensors, Transducers','Capacitive Touch Sensors'],'other'],
    [['Crystals, Oscillators, Resonators'],'other'],
    [[], 'other']
  ];
  for(const [labels,type] of cases)assert.equal(C.classifyCategories(labels),type,labels.join(' > '));
});

test('only product breadcrumb category links determine the type on either distributor',()=>{
  const link=(text,href)=>({textContent:text,getAttribute:()=>href});
  const dk='https://www.digikey.com/en/products/detail/murata-electronics/GRM155R70J105KA12J/4905166';
  const mouser='https://www.mouser.com/en/ProductDetail/onsemi/FUSB302BMPX';
  const doc=(selector,links)=>({querySelectorAll:s=>s===selector?links:[link('Capacitors','/en/c/capacitors/')]});
  assert.equal(C.readComponentType(doc('nav.MuiBreadcrumbs-root a',[
    link('Capacitors','/en/products/category/capacitors/3'),link('Ceramic Capacitors','/en/products/filter/ceramic-capacitors/60')]),dk),'passives');
  assert.equal(C.readComponentType(doc('#pdpBreadcrumb .breadcrumb a',[
    link('Semiconductors','/en/c/semiconductors/'),link('Interface ICs','/en/c/semiconductors/interface-ics/')]),mouser),'ics');
  assert.equal(C.readComponentType(doc('#pdpBreadcrumb .breadcrumb a',[
    link('Passive Components','/c/passive-components/'),link('Resistors','/c/passive-components/resistors/')]),mouser.replace('www.mouser','eu.mouser')),'passives');
  assert.equal(C.readComponentType(doc('nav.MuiBreadcrumbs-root a',[
    link('Capacitors','https://evil.test/en/products/category/capacitors/3'),link('Capacitors','/en/products/detail/vendor/Capacitors/123')]),dk),'other');
});

test('defaults hide only passives and require boolean overrides',()=>{
  for(const t of C.COMPONENT_TYPES)assert.equal(C.componentTypeEnabled(t.id),t.id!=='passives');
  assert.equal(C.componentTypeEnabled('passives',{[C.typeKey('passives')]:true}),true);
  assert.equal(C.componentTypeEnabled('ics',{[C.typeKey('ics')]:false}),false);
  assert.equal(C.componentTypeEnabled('passives',{[C.typeKey('passives')]:'true'}),false);
  assert.equal(C.componentTypeEnabled('unrecognized'),true);
  assert.equal(C.componentTypeEnabled('unrecognized',{[C.typeKey('other')]:false}),false);
});
