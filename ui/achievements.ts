import data from './generated/runtime.json';
import type { I18n } from './i18n';
export const achievements = data.achievements;
export type Achievement = typeof achievements[number];
export function achievementText(a: Achievement, progress: number, i18n: I18n) {
  return { id:a.enumValue, title:i18n.t(`achievement.${a.enumValue}.name`),
    description:a.is_secret && progress<100 ? '???' : i18n.t(`achievement.${a.enumValue}.desc`),
    points:a.gamerscore, progress, secret:a.is_secret };
}
export const leaderboardName = (category: number, i18n:I18n) => {
  const b=data.leaderboards.find(b=>b.category===category);
  return b ? i18n.t(`leaderboard.${b.id}.name`) : `${i18n.t('mode.3.name')} · ${i18n.t('difficulty.0.name')}`;
};
export { AchievementNotices } from './achievement-notices';
