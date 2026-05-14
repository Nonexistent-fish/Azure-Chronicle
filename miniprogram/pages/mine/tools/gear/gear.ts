export {};

interface GearItem {
  id: number; teeth: number; module: number; materialName: string; materialKey: string; color: string;
  isSource: boolean; inputRPM: number; inputTorque: number; inputDirection: 1 | -1; 
  rpm: string; torque: string; direction: 1 | -1; diameter: number; animDuration: number; icon: string;
  isStrobe?: boolean;
}

interface GearChain { id: string; module: number; isJammed: boolean; gears: GearItem[]; }

const MATERIALS: Record<string, {name: string, color: string}> = {
  steel: { name: '合金钢', color: '#94a3b8' }, brass: { name: '黄铜', color: '#fbbf24' }, poly: { name: '高分子', color: '#f472b6' }
};

Page<any, any>({
  data: {
    chains: [] as GearChain[], nextModule: 3, nextTeeth: 20, camX: 0, camY: 0,
    selectedChainIdx: -1, selectedGearIdx: -1, selectedGear: null as GearItem | null,
  },

  onLoad() { this.initCamera(); this.createNewChain(); },

  initCamera() {
    const sys = wx.getSystemInfoSync();
    this.setData({ camX: (sys.windowWidth - (4000 / 750) * sys.windowWidth) / 2, camY: (sys.windowHeight - (4000 / 750) * sys.windowWidth) / 2 });
  },

  preventCollapse() {},
  clearSelection() { this.setData({ selectedChainIdx: -1, selectedGearIdx: -1, selectedGear: null }); },

  generateGearSVG(teeth: number, color: string) {
    const z = parseInt(teeth as any, 10);
    const cx = 50, cy = 50, outerRadius = 49, innerRadius = outerRadius * ((z - 2.5) / (z + 2)); 
    let d = ""; const angleStep = 360 / z;
    
    for (let i = 0; i < z; i++) {
      const angle = i * angleStep, toothTopWidth = angleStep * 0.4;
      const getCoord = (r: number, ang: number) => `${(cx + r * Math.cos((ang - 90) * Math.PI / 180)).toFixed(2)},${(cy + r * Math.sin((ang - 90) * Math.PI / 180)).toFixed(2)}`; 
      d += `${i === 0 ? 'M' : 'L'} ${getCoord(innerRadius, angle - angleStep / 2 + 0.5)} L ${getCoord(outerRadius, angle - toothTopWidth / 2)} L ${getCoord(outerRadius, angle + toothTopWidth / 2)} L ${getCoord(innerRadius, angle + angleStep / 2 - 0.5)} `;
    }
    d += "Z";
    
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${color}" d="${d}" stroke="#000000" stroke-opacity="0.15" stroke-width="0.5"/><circle cx="50" cy="50" r="${innerRadius - 4}" fill="${color}" opacity="0.4"/><line x1="50" y1="50" x2="50" y2="${(50 - innerRadius).toFixed(2)}" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round"/><circle cx="50" cy="50" r="12" fill="#1e293b" stroke="${color}" stroke-width="2"/></svg>`)}`;
  },

  calcDiameter(z: number, m: number) { return (z * m * 3.5) + 60; },

  createNewChain() {
    const mat = MATERIALS['steel'];
    const newGear: GearItem = {
      id: Date.now(), teeth: this.data.nextTeeth, module: this.data.nextModule, materialName: mat.name, materialKey: 'steel', color: mat.color,
      isSource: true, inputRPM: 20, inputTorque: 100, inputDirection: 1, rpm: '20', torque: '100', direction: 1, 
      diameter: this.calcDiameter(this.data.nextTeeth, this.data.nextModule), animDuration: 3, isStrobe: false, icon: this.generateGearSVG(this.data.nextTeeth, mat.color)
    };
    const newChains = [...this.data.chains, { id: `chain_${Date.now()}`, module: this.data.nextModule, isJammed: false, gears: [newGear] }];
    this.setData({ chains: newChains, selectedChainIdx: newChains.length - 1, selectedGearIdx: 0, selectedGear: newGear });
    this.recalculateChain(newChains.length - 1);
  },

  appendGearToChain() {
    const cIdx = this.data.selectedChainIdx; if (cIdx === -1) return;
    const chain = this.data.chains[cIdx], mat = MATERIALS['steel'];
    chain.gears.push({
      id: Date.now(), teeth: 20, module: chain.module, materialName: mat.name, materialKey: 'steel', color: mat.color,
      isSource: false, inputRPM: 0, inputTorque: 0, inputDirection: 1, rpm: '0', torque: '0', direction: 1, 
      diameter: this.calcDiameter(20, chain.module), animDuration: 0, isStrobe: false, icon: this.generateGearSVG(20, mat.color)
    });
    this.recalculateChain(cIdx);
    this.setData({ selectedGearIdx: chain.gears.length - 1, selectedGear: chain.gears[chain.gears.length - 1] });
    wx.vibrateShort({ type: 'medium' });
  },

  resetAll() { this.setData({ chains: [], selectedChainIdx: -1, selectedGearIdx: -1, selectedGear: null }); this.initCamera(); },
  selectGear(e: any) { const { cidx, gidx } = e.currentTarget.dataset; this.setData({ selectedChainIdx: cidx, selectedGearIdx: gidx, selectedGear: this.data.chains[cidx].gears[gidx] }); },

  onModuleChange(e: any) { this.setData({ nextModule: e.detail.value }); },
  onInputModule(e: any) { const val = parseFloat(e.detail.value); if (!isNaN(val)) this.setData({ nextModule: Math.max(2, Math.min(6, val)) }); },
  onNextTeethChange(e: any) { this.setData({ nextTeeth: e.detail.value }); },
  onInputNextTeeth(e: any) { const val = parseInt(e.detail.value); if (!isNaN(val)) this.setData({ nextTeeth: Math.max(8, Math.min(48, val)) }); },

  onEditTeeth(e: any) { this.updateTeethData(e.detail.value); },
  onInputTeeth(e: any) { const val = parseInt(e.detail.value); if (!isNaN(val)) this.updateTeethData(Math.max(8, Math.min(48, val))); },
  updateTeethData(newTeeth: number) {
    const chain = this.data.chains[this.data.selectedChainIdx], gear = chain.gears[this.data.selectedGearIdx];
    if (gear.teeth === newTeeth) return;
    gear.teeth = newTeeth; gear.diameter = this.calcDiameter(newTeeth, chain.module); gear.icon = this.generateGearSVG(newTeeth, gear.color);
    this.recalculateChain(this.data.selectedChainIdx);
  },

  setRole(e: any) {
    const gear = this.data.chains[this.data.selectedChainIdx].gears[this.data.selectedGearIdx];
    gear.isSource = (e.currentTarget.dataset.role === 'source');
    if (gear.isSource) { gear.inputRPM = 20; gear.inputTorque = 100; gear.inputDirection = 1; }
    this.recalculateChain(this.data.selectedChainIdx);
  },

  toggleMaterial() {
    const keys = ['steel', 'brass', 'poly'], gear = this.data.chains[this.data.selectedChainIdx].gears[this.data.selectedGearIdx];
    const newKey = keys[(keys.indexOf(gear.materialKey) + 1) % keys.length], mat = MATERIALS[newKey];
    gear.materialKey = newKey; gear.materialName = mat.name; gear.color = mat.color; gear.icon = this.generateGearSVG(gear.teeth, mat.color);
    this.setData({ chains: this.data.chains, selectedGear: gear }); wx.vibrateShort({ type: 'light' });
  },

  toggleDirection() {
    const gear = this.data.chains[this.data.selectedChainIdx].gears[this.data.selectedGearIdx];
    if (!gear.isSource) return;
    gear.inputDirection = gear.inputDirection === 1 ? -1 : 1;
    this.recalculateChain(this.data.selectedChainIdx); wx.vibrateShort({ type: 'light' });
  },

  onSourceSpeedChange(e: any) { this.updateRPM(e.detail.value); },
  onInputRPM(e: any) { const val = parseInt(e.detail.value); if (!isNaN(val)) this.updateRPM(Math.max(0, Math.min(1000, val))); },
  updateRPM(val: number) { this.data.chains[this.data.selectedChainIdx].gears[this.data.selectedGearIdx].inputRPM = val; this.recalculateChain(this.data.selectedChainIdx); },

  onSourceTorqueChange(e: any) { this.updateTorque(e.detail.value); },
  onInputTorque(e: any) { const val = parseInt(e.detail.value); if (!isNaN(val)) this.updateTorque(Math.max(10, Math.min(1000, val))); },
  updateTorque(val: number) { this.data.chains[this.data.selectedChainIdx].gears[this.data.selectedGearIdx].inputTorque = val; this.recalculateChain(this.data.selectedChainIdx); },

  deleteGear() {
    const cIdx = this.data.selectedChainIdx, chains = this.data.chains;
    chains[cIdx].gears.splice(this.data.selectedGearIdx, 1);
    if (chains[cIdx].gears.length === 0) return this.setData({ chains: chains.filter((_, i) => i !== cIdx), selectedChainIdx: -1, selectedGearIdx: -1, selectedGear: null });
    this.recalculateChain(cIdx);
    const newGIdx = Math.max(0, this.data.selectedGearIdx - 1);
    this.setData({ selectedGearIdx: newGIdx, selectedGear: chains[cIdx].gears[newGIdx] });
  },

  recalculateChain(cIdx: number) {
    const chain = this.data.chains[cIdx], gears = chain.gears; let jammed = false, sourceIdx = gears.findIndex(g => g.isSource);
    
    if (sourceIdx === -1) {
      gears.forEach(g => { g.rpm = '0'; g.torque = '0'; g.animDuration = 0; g.isStrobe = false; });
      chain.isJammed = false;
      return this.setData({ chains: this.data.chains, selectedGear: this.data.selectedGearIdx !== -1 ? gears[this.data.selectedGearIdx] : null });
    }
    
    const base = gears[sourceIdx];
    base.rpm = base.inputRPM.toString(); base.direction = base.inputDirection; base.torque = base.inputTorque.toString(); 
    base.animDuration = base.inputRPM === 0 ? 0 : 60 / Math.abs(base.inputRPM);
    base.isStrobe = Math.abs(base.inputRPM) >= 300; 

    const calcGear = (curr: GearItem, ref: GearItem) => {
      if (jammed) return;
      const ratio = ref.teeth / curr.teeth, rpm = parseFloat(ref.rpm) * ratio, expectedDir = ref.direction * -1;
      if (curr.isSource && (Math.abs(rpm - curr.inputRPM) > 50 || expectedDir !== curr.inputDirection)) jammed = true;
      curr.rpm = rpm.toFixed(0); curr.direction = expectedDir as 1 | -1; curr.torque = (parseFloat(ref.torque) / ratio).toFixed(1); 
      curr.animDuration = rpm === 0 ? 0 : 60 / Math.abs(rpm); curr.isStrobe = Math.abs(rpm) >= 300; 
    };

    for (let i = sourceIdx + 1; i < gears.length; i++) calcGear(gears[i], gears[i-1]);
    for (let i = sourceIdx - 1; i >= 0; i--) calcGear(gears[i], gears[i+1]);

    chain.isJammed = jammed; if (jammed) wx.vibrateLong(); 
    this.setData({ chains: this.data.chains, selectedGear: this.data.selectedGearIdx !== -1 ? gears[this.data.selectedGearIdx] : null });
  }
});