/* eslint-disable prefer-destructuring */
/* eslint-disable no-use-before-define */

// Copyright (c) 2020-21 PaperCut Software Int Pty Ltd
// http://www.papercut.com/
// Author: Chris Dance ( https://github.com/codedance )

'use strict';

console.log('Starting Talk-o-meter for Google Meet...');

// Inject in our own styles
const scriptInject = document.createElement('style');

scriptInject.innerHTML = `
._tom-status {
    font-size: 0.8em;
  }

._tom-hover-zone {
    position: absolute;
    z-index: 99;
    width: 200px;
    height: 1em;
  }

._tom-hover-text {
    font-size: 13px;
    line-height: 1.3;
    visibility: hidden;
    width: 170px;
    color: #fff;
    background: #434649;
    text-align: center;
    border-radius: 3px;
    text-shadow: none;
    padding: 8px 15px;
    position: absolute;
    z-index: 3;
    opacity: 0;
    transition: opacity 0.3s;
    margin-top: -5.2em;
    margin-left: -30px;
  }
._tom-hover-text::before {
    content: '';
    width: 8px;
    height: 8px;
    background: #434649;
    border-top: 0;
    border-left: 0;
    position: absolute;
    left: 50%;
    margin: 0 0 0 -5px;
    bottom: -4px;
    transform-origin: 50% 50%;
    transform: rotate(45deg) translate(0, 0);
}

 ._tom-hover-zone:hover ._tom-hover-text {
    visibility: visible;
    opacity: 1;
  }
`;
document.body.append(scriptInject);

// Inject in Font Awesome so we can use some of it's arrows/indicators
const link = document.createElement('link');

link.rel = 'stylesheet';
link.type = 'text/css';
link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.1/css/all.min.css';
document.getElementsByTagName('HEAD')[0].appendChild(link);


const findVolume = window.setInterval(() => {
    if (window.default_MeetingsUi) {
        console.log('found default_MeetingsUi...');

        const meetingsUi = window.default_MeetingsUi;

        // eslint-disable-next-line guard-for-in
        for (const ko in meetingsUi) {
            const v = meetingsUi[ko];

            if (!v || !v.prototype) {
                continue;
            }

            for (const k of Object.getOwnPropertyNames(v.prototype)) {
                const p = Object.getOwnPropertyDescriptor(v.prototype, k);

                if (k === 'constructor') {
                    continue;
                }

                if (p && p.value) {
                    const pValue = p.value.toString();
                    const m = /this\.([A-Za-z]+)\.getVolume\(\)/.exec(pValue);

                    if (m) {
                        v.prototype[k] = new Proxy(v.prototype[k], getVolumeProxy(m[1]));
                        console.log('Hooked Volume');
                        window.clearInterval(findVolume);
                        // Now we're in, we can kick off our UI update activity
                        window.setInterval(updateLabels, 1000);

                        return;
                    }
                }
            }
        }
    }
}, 1000);

const talkState = {
    participants: new Map(),
    totalParticipantTicks: 0,
};

function trackTalk(name) {
    const now = Date.now();
    const participant = talkState.participants.get(name);

    if (participant !== undefined) {
        // Ticks = 1 second = 1000
        if (now > participant.last + 1000) {
            talkState.totalParticipantTicks++;
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
    const participantsArr = [...talkState.participants.entries()];
    let totalTicks = participantsArr.reduce((total, e) => total + e[1].ticks, 0);

    if (totalTicks === 0) {
        totalTicks = 1;
    }
    const avgTicks = 1.0 * totalTicks / participantsArr.length;

    const ranked = participantsArr.sort((a, b) => b[1].ticks - a[1].ticks);

    for (let i = 0; i < ranked.length; i++) {
        const name = ranked[i][0];
        const participant = ranked[i][1];

        participant.rank = i + 1;
        console.log(`${name} -> ticks: ${participant.ticks}, rank: ${participant.rank}`);
    }

    // Update all username labels in video windows
    const labels = document.querySelectorAll('[data-self-name]');

    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const name = label.childNodes[0].nodeValue;
        const participant = talkState.participants.get(name);

        if (participant) {
            insertStats(label, participant);
        }
    }

    // Update names in participants sidebar if it's visible
    const participantsList = document.querySelector('[aria-label="Participants"');

    if (participantsList && participantsList.offsetParent !== null) {
        // It's visible so do the work
        const allSpans = participantsList.querySelectorAll('span');

        for (const potential of allSpans) {
            let name = potential.childNodes[0]?.nodeValue;

            if (name) {
                if (name.endsWith('(You)')) {
                    name = 'You';
                }
                const participant = talkState.participants.get(name);

                if (participant) {
                    const label = potential;

                    insertStats(label, participant);
                }
            }
        }
    }

    function insertStats(label, participant) {
        let hoverZone = label.querySelector('span._tom-hover-zone');

        if (!hoverZone) {
            hoverZone = document.createElement('span');
            hoverZone.classList.add('_tom-hover-zone');
            label.appendChild(hoverZone);
        }

        let span = label.querySelector('span._tom-status');

        if (!span) {
            span = document.createElement('span');
            span.classList.add('_tom-status');
            label.appendChild(span);
        }

        // Hack: Turn off overflow on parent to ensure hover displays
        span.parentElement.parentElement.style.overflow = 'visible';

        const deltaAvg = (100.0 * (1.0 * participant.ticks - avgTicks) / avgTicks).toFixed();
        const percent = (1.0 * participant.ticks / totalTicks * 100).toFixed();
        const arrow = toArrow(deltaAvg);
        const rank = toOrdinal(participant.rank);

        let html = `&nbsp;(${rank} ${percent}% ${arrow} ${deltaAvg}%)`;

        span.innerHTML = html;

        // Add hover stats
        html = `<span class="_tom-hover-text">Rank ${rank} of ${ranked.length}<br />Talked for ${percent}% of the time<br />`;
        html += deltaAvg < 0 ? `${deltaAvg}% below the average` : `${deltaAvg}% above the average<br /></span>`;
        hoverZone.innerHTML = html;
    }
}

function getVolumeProxy(objKey) {
    return {
        apply(target, thisArg, argumentsList) {
            const volume = thisArg[objKey].getVolume();

            // Reduce workload by only acting on high(ish) sound (e.g. talking vs "just background sounds")
            // FUTURE: Tune this?
            if (volume < 0.4) {
                // Short circuit
                return target.apply(thisArg, argumentsList);
            }

            // Cache our video DOM element for performance
            if (!thisArg.tomVideoElem) {
                for (const v of Object.values(thisArg)) {
                    if (v instanceof HTMLElement) {
                        // Up 3
                        thisArg.tomVideoElem = v.parentElement.parentElement.parentElement;
                        break;
                    }
                }
            }

            // Extract the name associated with the volume change. [data-self-name] tags the DIV containing
            // the username.  We'll also ignore virtual "Presentation" users.
            const label = thisArg.tomVideoElem.querySelector('[data-self-name]');
            const name = label?.childNodes[0].nodeValue;

            if (name && !name.startsWith('Presentation ')) {
                trackTalk(name);
            }

            return target.apply(thisArg, argumentsList);
        },
    };
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
    const s = ['th', 'st', 'nd', 'rd'],
                v = n % 100;

    return `${n}<sup>${s[(v - 20) % 10] || s[v] || s[0]}</sup>`;
}
