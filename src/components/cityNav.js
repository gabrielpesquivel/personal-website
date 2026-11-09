export const CITY_GOTO_EVENT = 'city:goto';
export const CITY_DISTRICT_EVENT = 'city:district';

// Ask the city to drive to a landmark (about, experience, skills, blog, contact, home).
export function goToCityTarget(target) {
  window.dispatchEvent(new CustomEvent(CITY_GOTO_EVENT, { detail: target }));
}

// The nav section for the district currently on screen, so late subscribers can read it.
let currentDistrict = 'about';

export function announceDistrict(navId) {
  if (navId === currentDistrict) return;
  currentDistrict = navId;
  window.dispatchEvent(new CustomEvent(CITY_DISTRICT_EVENT, { detail: navId }));
}

export function getCurrentDistrict() {
  return currentDistrict;
}
