export const isStatsValid = (stats) => {
    return stats.timeSpan > 0 && stats.timeSpan !== Infinity;
};
