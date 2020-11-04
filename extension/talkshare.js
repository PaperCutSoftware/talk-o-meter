// Copyright (c) 2020 PaperCut Software Int Pty Ltd
// http://www.papercut.com/
// Author: Chris Dance (codedance @ GitHub)
'use strict';


console.log("Starting Talk Share for Google Meet...");

// Inject in our own styles
const s = document.createElement('style');
s.innerHTML = `
._ts-status {
    font-size: 0.8em;
  }

._ts-hover {
    position: fixed;
    z-index: 99;
  }

._ts-hover ._ts-hover-text {
    visibility: hidden;
    width: 170px;
    background-color: rgba(95, 99, 104, 0.87);
    color: #fff;
    text-align: center;
    border-radius: 2px;
    padding: 5px 0;
    position: absolute;
    z-index: 3;
    opacity: 0;
    transition: opacity 0.3s;

    margin-top: -4.8em;
    margin-left: -100px;
  }
  
 ._ts-hover:hover ._ts-hover-text {
    visibility: visible;
    opacity: 1;
  }
`;
document.body.append(s);

// Inject in Font Awesome so we can use some of it's arrows/indicators
var link = document.createElement('link');
link.rel = 'stylesheet';
link.type = 'text/css';
link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.1/css/all.min.css';
document.getElementsByTagName('HEAD')[0].appendChild(link);


let hookedVolume = false;
window.setInterval(() => {
    if (!hookedVolume && window.default_MeetingsUi) {
        console.log("found default_MeetingsUi...");
        let m;
        for (let [_k, v] of Object.entries(window.default_MeetingsUi)) {
            if (v && v.prototype) {
                for (let k of Object.keys(v.prototype)) {
                    const p = Object.getOwnPropertyDescriptor(v.prototype, k)
                    if (p && p.value) {
                        // this.[*].getVolume()
                        m = /this\.([A-Za-z]+)\.getVolume\(\)/.exec(p.value.toString());
                        if (m) {
                            console.log('Hooked into getVolume');
                            const p = new Proxy(v.prototype[k], getVolumeProxy(m[1]));
                            v.prototype[k] = p;
                            hookedVolume = true;
                            // Now we're in, we can kick off our UI update activity
                            window.setInterval(updateLabels, 3500);
                            return;
                        }
                    }
                }
            }
        }
    }
}, 1000);

let talkState = {
    participants: new Map(),
    totalTicks: 0
};

function trackTalk(name) {
    let now = Date.now();
    let participant = talkState.participants.get(name);
    if (participant !== undefined) {
        // Ticks = 1 second = 1000
        if (now > participant.last + 1000) {
            talkState.totalTicks++;
            participant.last = now;
            participant.ticks++;
        }
    } else {
        talkState.participants.set(name, {
            last: now,
            ticks: 1,
        });
    }
}

function updateLabels() {
    // Roll rank and percent
    let participantsArr = [...talkState.participants.entries()];
    let totalTicks = participantsArr.reduce((total, e) => total + e[1].ticks, 0);
    if (totalTicks == 0) totalTicks = 1;
    let avgTicks = 1.0 * totalTicks / participantsArr.length;

    let ranked = participantsArr.sort((a, b) => b[1].ticks - a[1].ticks);
    for (let i = 0; i < ranked.length; i++) {
        let name = ranked[i][0];
        let participant = ranked[i][1];
        participant.rank = i + 1;
        console.log(`${name} -> ticks: ${participant.ticks}, rank: ${participant.rank}`);
    }

    // Update all username labels in video windows
    let labels = document.querySelectorAll('[data-self-name]');
    for (let i = 0; i < labels.length; i++) {
        let label = labels[i];
        let name = label.childNodes[0].nodeValue;
        let participant = talkState.participants.get(name);
        if (participant) {
            insertStats(label, participant);
        }
    }

    // Update names in sidebar if it's visible
    let sidebar = document.querySelector('[role=tabpanel]');
    if (sidebar && window.getComputedStyle(sidebar)['display'] !== 'none') {
        let allDivs = sidebar.querySelectorAll("div");
        for (const potential of allDivs) {
            let name = potential.childNodes[0]?.nodeValue;
            if (name) {
                if (name.endsWith("(You)")) {
                    name = "You";
                }
                let participant = talkState.participants.get(name);
                if (participant) {
                    let label = potential;
                    insertStats(label, participant);
                }
            }
         }
    }

    function insertStats(label, participant) {
        let span = label.querySelector("span");
        if (!span) {
            span = document.createElement("span");
            span.classList.add("_ts-status");
            span.classList.add("_ts-hover");
            label.appendChild(span);
        }
        let deltaAvg = (100.0 * (1.0 * participant.ticks - avgTicks) / avgTicks).toFixed();
        let percent = (((1.0 * participant.ticks) / totalTicks) * 100).toFixed();
        let arrow = toArrow(deltaAvg);
        let rank = toOrdinal(participant.rank);

        let html = `&nbsp;(${rank} ${arrow} ${deltaAvg}%)`;

        // Add hover stats
        html += `<span class="_ts-hover-text">Rank ${rank} of ${ranked.length}<br />Talked for ${percent}% of the time<br />`;
        html += (deltaAvg < 0) ? `${deltaAvg}% below the average` : `${deltaAvg}% above the average<br /></span>`;

        span.innerHTML = html;
    }
}

function getVolumeProxy(objKey) {
    return {
        apply: function (target, thisArg, argumentsList) {
            let volume = thisArg[objKey].getVolume();

            // Reduce workload by only acting on high(ish) sound (e.g. talking vs "just background sounds")
            // FUTURE: Tune this?
            if (volume < 0.4) {
                // Short circuit
                return target.apply(thisArg, argumentsList);
            }

            // Cache our video DOM element for performance
            if (!thisArg._tsVideoElem) {
                for (let v of Object.values(thisArg)) {
                    if (v instanceof HTMLElement) {
                        // Up 3
                        thisArg._tsVideoElem = v.parentElement.parentElement.parentElement;
                        break;
                    }
                }
            }

            // Extract the name associated with the volume change. [data-self-name] tags the DIV containing
            // the username.  We'll also ignore virtual "Presentation" users.
            let label = thisArg._tsVideoElem.querySelector('[data-self-name]');
            let name = label?.childNodes[0].nodeValue;
            if (name && !name.startsWith("Presentation ")) {
                trackTalk(name);
            }

            return target.apply(thisArg, argumentsList);
        },
    }
}

// An direction arrow icon to indicate if the user is above or below average
function toArrow(deltaAvg) {
    if (deltaAvg < -50) {
        return '<i class="fas fa-angle-double-down"></i>';
    } else if (deltaAvg > 50) {
        return '<i class="fas fa-angle-double-up"></i>';
    } else if (deltaAvg < 0) {
        return '<i class="fas fa-angle-down"></i>';
    } else if (deltaAvg > 0) {
        return '<i class="fas fa-angle-up"></i>';
    }
    return '<i class="fas fa-arrows-alt-h"></i>';
}

function toOrdinal(n) {
    var s = ["th", "st", "nd", "rd"],
        v = n % 100
    return n + '<sup>' + (s[(v - 20) % 10] || s[v] || s[0]) + '</sup>';
}