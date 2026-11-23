/**
 * Анатомические группы костей для оверлея скелета.
 *
 * Логика перенесена из Rephlexia Studio: там скелет раскрашен по шести группам
 * (голова, корпус, две руки, две ноги) — по цвету сразу видно, к какой части
 * тела относится подсвеченный сустав. В Rephlexia у узлов рига было готовое
 * поле `group`, потому что риг свой. Morphia работает с чужими моделями (VRM,
 * AnimeBase, импортированный FBX), поэтому группа определяется по имени кости.
 *
 * Поддерживаются имена VRM (`J_Bip_C_Hips`, `J_Bip_L_UpperArm`), Mixamo
 * (`mixamorigLeftArm`), Blender/Rigify (`DEF-upper_arm.L`) и обычные
 * человеческие имена (`LeftShoulder`, `right_thigh`).
 */

/** Цвета групп — те же, что в Rephlexia, чтобы скелет выглядел одинаково. */
export const BONE_GROUP_COLORS = Object.freeze({
  head: 0xd89cdd,
  body: 0xaaa0ff,
  armLeft: 0xefc778,
  armRight: 0x7ed7be,
  legLeft: 0xefad96,
  legRight: 0x86c6df,
  other: 0xafa6ff,
});

/** Подписи групп для панелей и подсказок. */
export const BONE_GROUP_LABELS = Object.freeze({
  head: 'Голова',
  body: 'Корпус',
  armLeft: 'Левая рука',
  armRight: 'Правая рука',
  legLeft: 'Левая нога',
  legRight: 'Правая нога',
  other: 'Прочее',
});

const HEAD = /head|neck|eye|jaw|ear|tongue|teeth|tooth|hair|face|brow|cheek|nose|lip|mustache|beard/;
const BODY = /hips?|pelvis|spine|chest|torso|ribcage|breast|clavicle|shoulder|upperchest|waist/;
const ARM = /arm|elbow|hand|wrist|thumb|index|middle|ring|little|pinky|finger|clavicle|shoulder/;
const LEG = /leg|thigh|calf|shin|knee|foot|ankle|toe|heel|hip/;

const LEFT = /(^|[^a-z])(left|l)([^a-z]|$)/;
const RIGHT = /(^|[^a-z])(right|r)([^a-z]|$)/;

/** Убираем служебные префиксы и приводим имя к «словам» через разделители. */
function normalizeBoneName(name) {
  return String(name || '')
    .replace(/^(mixamorig|j_?bip_?c_?|j_?bip_?|def-?|org-?|bip0?\d*\s*)/gi, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Сторона кости: 'L', 'R' или null. */
export function boneSide(name) {
  const normalized = normalizeBoneName(name);
  if (!normalized) return null;
  if (LEFT.test(normalized)) return 'L';
  if (RIGHT.test(normalized)) return 'R';
  // VRM пишет сторону одной буквой после префикса: «l upperarm».
  if (/(^|\s)l(\s|$)/.test(normalized)) return 'L';
  if (/(^|\s)r(\s|$)/.test(normalized)) return 'R';
  return null;
}

/**
 * Группа кости по имени: 'head' | 'body' | 'armLeft' | 'armRight' |
 * 'legLeft' | 'legRight' | 'other'.
 */
export function classifyBoneGroup(name) {
  const normalized = normalizeBoneName(name);
  if (!normalized) return 'other';
  const side = boneSide(name);
  // Конечности проверяем раньше корпуса: «shoulder» бывает и там, и там.
  if (ARM.test(normalized)) return side === 'R' ? 'armRight' : side === 'L' ? 'armLeft' : 'body';
  if (LEG.test(normalized)) return side === 'R' ? 'legRight' : side === 'L' ? 'legLeft' : 'body';
  if (HEAD.test(normalized)) return 'head';
  if (BODY.test(normalized)) return 'body';
  return 'other';
}

/** Цвет группы в виде числа 0xRRGGBB. */
export function boneGroupColor(name) {
  return BONE_GROUP_COLORS[classifyBoneGroup(name)] ?? BONE_GROUP_COLORS.other;
}

/** Компактная статистика по костям — для подсказок и документации. */
export function summarizeBoneGroups(bones = []) {
  const counts = Object.create(null);
  for (const bone of bones) {
    const group = classifyBoneGroup(bone?.name);
    counts[group] = (counts[group] || 0) + 1;
  }
  return counts;
}
