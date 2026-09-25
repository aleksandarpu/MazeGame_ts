import changePlayerUrl from "../assets/sound/changePlayer.wav";
import collectUrl from "../assets/sound/collect.wav";
import damageTakenUrl from "../assets/sound/Damage_taken.wav";
import footstepUrl from "../assets/sound/footstep.wav";
import rollUrl from "../assets/sound/roll.wav";
import winningUrl from "../assets/sound/winning.wav";
import wrongAnswerUrl from "../assets/sound/wrongAnswer.wav";

const soundUrls = {
  changePlayer: changePlayerUrl, // next player's turn
  collect: collectUrl, // correct answer
  damageTaken: damageTakenUrl, // move blocked by a wall or the maze edge
  footstep: footstepUrl, // player moved one field
  roll: rollUrl, // dice rolling
  winning: winningUrl, // victory pop-up
  wrongAnswer: wrongAnswerUrl, // wrong answer or timeout
};

export type SoundName = keyof typeof soundUrls;

// Preload every sound once; each play uses a copy so the same sound can overlap
const sounds = {} as Record<SoundName, HTMLAudioElement>;
for (const [name, url] of Object.entries(soundUrls) as [SoundName, string][]) {
  const audio = new Audio(url);
  audio.preload = "auto";
  sounds[name] = audio;
}

// ---------- Muting ----------
// Groups the player can mute from the game screen (the victory sound is never muted)
export const muteGroups = [
  { id: "steps", label: "steps", sounds: ["footstep"] },
  { id: "dice", label: "dice", sounds: ["roll"] },
  { id: "answers", label: "answers", sounds: ["collect", "wrongAnswer"] },
  { id: "nextPlayer", label: "next player", sounds: ["changePlayer"] },
  { id: "wall", label: "wall", sounds: ["damageTaken"] },
] as const satisfies readonly { id: string; label: string; sounds: readonly SoundName[] }[];

export type MuteGroupId = (typeof muteGroups)[number]["id"];

const MUTE_STORAGE_KEY = "mazegame.mutedSounds";

function loadMutedGroups(): Set<MuteGroupId> {
  try {
    const saved = JSON.parse(localStorage.getItem(MUTE_STORAGE_KEY) ?? "[]");
    const valid = new Set<string>(muteGroups.map((g) => g.id));
    return new Set(Array.isArray(saved) ? saved.filter((id): id is MuteGroupId => valid.has(id)) : []);
  } catch {
    return new Set();
  }
}

const mutedGroups = loadMutedGroups();

export function isGroupMuted(id: MuteGroupId): boolean {
  return mutedGroups.has(id);
}

/** Mutes or unmutes a group; the choice is remembered in localStorage */
export function setGroupMuted(id: MuteGroupId, muted: boolean) {
  if (muted) mutedGroups.add(id);
  else mutedGroups.delete(id);
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, JSON.stringify([...mutedGroups]));
  } catch {
    // Storage can be unavailable; the choice then lasts only for this page
  }
}

function isSoundMuted(name: SoundName): boolean {
  return muteGroups.some((g) => mutedGroups.has(g.id) && (g.sounds as readonly SoundName[]).includes(name));
}

/** Plays a sound (unless its group is muted); returns the copy so callers can stop it early */
export function playSound(name: SoundName): HTMLAudioElement {
  const audio = sounds[name].cloneNode() as HTMLAudioElement;
  if (isSoundMuted(name)) return audio;
  // Browsers can block audio until the user has interacted with the page; ignore that
  audio.play().catch(() => {});
  return audio;
}

/** Fades a playing sound out over `durationMs`, then stops it */
export function fadeOutSound(audio: HTMLAudioElement, durationMs: number = 250) {
  const startVolume = audio.volume;
  const startTime = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - startTime) / durationMs);
    audio.volume = startVolume * (1 - t);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      audio.pause();
    }
  };
  requestAnimationFrame(tick);
}
