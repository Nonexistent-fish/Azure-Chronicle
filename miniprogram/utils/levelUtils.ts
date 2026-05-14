// utils/levelUtils.ts

export interface LevelInfo {
  level: number;
  title: string;
  color: string;
  bgColor: string; // 浅色背景，配合文字颜色使用
}

/**
 * 核心升级曲线与视觉映射
 * 只需要传入经验值，瞬间返回对应的等级、称号和颜色方案
 */
export const xpToLevel = (xp: number | undefined): LevelInfo => {
  const currentXp = xp || 0;

  // Lv.10 校园传说
  if (currentXp >= 20000) {
    return { level: 10, title: '', color: '#ff0000', bgColor: 'rgba(255, 0, 0, 0.1)' }; // 或者你可以用特殊的 CSS 类做流光
  }
  // Lv.9 镇站之宝
  if (currentXp >= 10000) {
    return { level: 9, title: '', color: '#d48806', bgColor: 'rgba(212, 136, 6, 0.15)' }; // 渐变金预留
  }
  // Lv.8 校园百事通 
  if (currentXp >= 5000) {
    return { level: 8, title: '', color: '#f5222d', bgColor: 'rgba(245, 34, 45, 0.1)' }; // 红
  }
  // Lv.7 风云人物
  if (currentXp >= 2000) {
    return { level: 7, title: '', color: '#fa8c16', bgColor: 'rgba(250, 140, 22, 0.1)' }; // 橙
  }
  // Lv.6 话题制造机
  if (currentXp >= 1000) {
    return { level: 6, title: '', color: '#eb2f96', bgColor: 'rgba(235, 47, 150, 0.1)' }; // 粉紫
  }
  // Lv.5 社交达人
  if (currentXp >= 500) {
    return { level: 5, title: '', color: '#722ed1', bgColor: 'rgba(114, 46, 209, 0.1)' }; // 紫
  }
  // Lv.4 铁杆校友 
  if (currentXp >= 200) {
    return { level: 4, title: '', color: '#2f54eb', bgColor: 'rgba(47, 84, 235, 0.1)' }; // 深蓝
  }
  // Lv.3 活跃分子 
  if (currentXp >= 100) {
    return { level: 3, title: '', color: '#1890ff', bgColor: 'rgba(24, 144, 255, 0.1)' }; // 蓝
  }
  // Lv.2 潜水观察员 
  if (currentXp >= 50) {
    return { level: 2, title: '', color: '#52c41a', bgColor: 'rgba(82, 196, 26, 0.1)' }; // 绿
  }
  
  // Lv.1 校园萌新
  return { level: 1, title: '', color: '#999999', bgColor: 'rgba(153, 153, 153, 0.1)' }; // 灰
};