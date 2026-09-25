import changePlayerUrl from "../assets/sound/changePlayer.wav";
import collectUrl from "../assets/sound/collect.wav";
import damageTakenUrl from "../assets/sound/Damage_taken.wav";
import footstepUrl from "../assets/sound/footstep.wav";
import winningUrl from "../assets/sound/winning.wav";
import wrongAnswerUrl from "../assets/sound/wrongAnswer.wav";

const soundUrls = {
  changePlayer: changePlayerUrl, // next player's turn
  collect: collectUrl, // correct answer
  damageTaken: damageTakenUrl, // move blocked by a wall or the maze edge
  footstep: footstepUrl, // player moved one field
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

export function playSound(name: SoundName) {
  const audio = sounds[name].cloneNode() as HTMLAudioElement;
  // Browsers can block audio until the user has interacted with the page; ignore that
  audio.play().catch(() => {});
}
