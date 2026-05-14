export {};
const db = wx.cloud.database();

const UNIT_DICT: Record<string, any> = {
  data: { id: 'data', name: '数据/网速', icon: '📶', units: [{ name: 'MB/s (兆字节/秒)', rate: 1 }, { name: 'KB/s (千字节/秒)', rate: 1024 }, { name: 'GB/s (吉字节/秒)', rate: 0.0009765625 }, { name: 'Mbps (兆比特/秒)', rate: 8 }] },
  torque: { id: 'torque', name: '扭矩', icon: '🔧', units: [{ name: 'N·m (牛·米)', rate: 1 }, { name: 'kgf·m (千克力·米)', rate: 0.10197 }, { name: 'lbf·ft (磅力·英尺)', rate: 0.73756 }] },
  power: { id: 'power', name: '功率', icon: '⚡', units: [{ name: 'kW (千瓦)', rate: 1 }, { name: 'W (瓦特)', rate: 1000 }, { name: 'HP (英制马力)', rate: 1.34102 }, { name: 'PS (米制马力)', rate: 1.35962 }] },
  currency: { id: 'currency', name: '货币汇率', icon: '💴', units: [{ name: 'CNY (人民币)', rate: 1, symbol: '¥' }, { name: 'USD (美元)', rate: 0.14, symbol: '$' }, { name: 'EUR (欧元)', rate: 0.13, symbol: '€' }, { name: 'JPY (日元)', rate: 21.05, symbol: '¥' }, { name: 'GBP (英镑)', rate: 0.11, symbol: '£' }, { name: 'RUB (俄罗斯卢布)', rate: 13.0, symbol: '₽' }, { name: 'KRW (韩元)', rate: 188.5, symbol: '₩' }] },
  length: { id: 'length', name: '工程长度', icon: '📏', units: [{ name: 'mm (毫米)', rate: 1 }, { name: 'cm (厘米)', rate: 0.1 }, { name: 'm (米)', rate: 0.001 }, { name: 'in (英寸)', rate: 0.03937 }] }
};

Page<any, any>({
  data: {
    categories: Object.values(UNIT_DICT), activeCategory: 'data', currentUnits: UNIT_DICT['data'].units, 
    fromUnitIndex: 0, inputValue: '', targetCards: [{ unitIndex: 1, outputValue: '' }]
  },

  async onLoad() {
    try {
      const res = await db.collection('exchange_rates').doc('latest').get();
      if (res.data?.rates) {
        const cloudRates = res.data.rates;
        const currencyUnits = UNIT_DICT['currency'].units;
        currencyUnits.forEach((unit: any) => { const code = unit.name.split(' ')[0]; if (cloudRates[code]) unit.rate = cloudRates[code]; });
        if (this.data.activeCategory === 'currency') { this.setData({ currentUnits: currencyUnits }); this.runCalculation(this.data.inputValue); }
      }
    } catch { console.log('拉取云端汇率失败，降级使用本地默认汇率'); }
  },

  switchCategory(e: any) {
    const catId = e.currentTarget.dataset.id;
    if (this.data.activeCategory === catId) return;
    this.setData({ activeCategory: catId, currentUnits: UNIT_DICT[catId].units, fromUnitIndex: 0, inputValue: '', targetCards: [{ unitIndex: 1, outputValue: '' }] });
  },

  onInput(e: any) {
    let value = e.detail.value.replace(/[^\d.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
    if (value.includes('.') && value.split('.')[1].length > 2) value = value.split('.')[0] + '.' + value.split('.')[1].substring(0, 2);
    if (value.length > 1 && value.startsWith('0') && value[1] !== '.') value = value.replace(/^0+/, '') || '0';
    if (value.startsWith('.')) value = '0' + value;

    this.setData({ inputValue: value }); this.runCalculation(value);
    return value;
  },

  onFromUnitChange(e: any) { this.setData({ fromUnitIndex: parseInt(e.detail.value) }, () => this.runCalculation(this.data.inputValue)); },

  onToUnitChange(e: any) {
    const targetCards = this.data.targetCards;
    targetCards[e.currentTarget.dataset.index].unitIndex = parseInt(e.detail.value);
    this.setData({ targetCards }, () => this.runCalculation(this.data.inputValue));
  },

  addTargetCard() {
    const targetCards = this.data.targetCards;
    if (targetCards.length >= 2) return;
    let newUnitIndex = 0;
    for (let i = 0; i < this.data.currentUnits.length; i++) { if (i !== this.data.fromUnitIndex && i !== targetCards[0].unitIndex) { newUnitIndex = i; break; } }
    targetCards.push({ unitIndex: newUnitIndex, outputValue: '' });
    this.setData({ targetCards }, () => this.runCalculation(this.data.inputValue));
  },

  swapUnits() {
    const targetCards = this.data.targetCards;
    const oldTo = targetCards[0].unitIndex;
    targetCards[0].unitIndex = this.data.fromUnitIndex;
    this.setData({ fromUnitIndex: oldTo, targetCards }, () => this.runCalculation(this.data.inputValue));
  },

  runCalculation(val: string) {
    const targetCards = this.data.targetCards;
    if (!val || val.trim() === '') { targetCards.forEach((c: any) => c.outputValue = ''); return this.setData({ targetCards }); }
    
    const inputNum = parseFloat(val);
    if (isNaN(inputNum)) { targetCards.forEach((c: any) => c.outputValue = 'Error'); return this.setData({ targetCards }); }
    if (inputNum === 0) { targetCards.forEach((c: any) => c.outputValue = '0.00'); return this.setData({ targetCards }); }

    const fromUnit = this.data.currentUnits[this.data.fromUnitIndex];
    const rawResults = targetCards.map((card: any) => (inputNum / fromUnit.rate) * this.data.currentUnits[card.unitIndex].rate);

    let decimals = 2;
    let formattedStrings = rawResults.map((r: any) => r.toFixed(decimals));

    while (decimals < 8) {
      const hasZero = formattedStrings.some((s: string) => parseFloat(s) === 0);
      let hasFalseDuplicate = false;
      for (let i = 0; i < formattedStrings.length; i++) {
        for (let j = i + 1; j < formattedStrings.length; j++) { if (formattedStrings[i] === formattedStrings[j] && rawResults[i] !== rawResults[j]) hasFalseDuplicate = true; }
      }
      if (!hasZero && !hasFalseDuplicate) break;
      decimals++; formattedStrings = rawResults.map((r: any) => r.toFixed(decimals));
    }

    targetCards.forEach((card: any, i: number) => card.outputValue = formattedStrings[i]);
    this.setData({ targetCards });
  }
});