import { mountChrome, LAB_NOTE } from "/design-lab/move-together/_together-mock.js";
import { mountRelationshipStory } from "/design-lab/move-together/story/relationship-story.js";

mountChrome("Relationship Story", "06");

const root = document.createElement("div");
root.className = "rs-root rs-root--fullscreen";
document.body.appendChild(root);

mountRelationshipStory(root, { layout: "fullscreen" });

const badge = document.createElement("p");
badge.className = "story-badge";
badge.style.cssText =
  "position:fixed;right:24px;top:calc(52px + 12px);z-index:40;font-family:var(--mono);font-size:9px;color:var(--muted);";
badge.textContent = LAB_NOTE;
document.body.appendChild(badge);
