// Copyright (c) 2020-2022 PaperCut Software Int Pty Ltd
// http://www.papercut.com/
// Author: Chris Dance ( https://github.com/codedance )

// Inject our script into the Google Meet page
const s = document.createElement('script');

s.src = chrome.runtime.getURL('talk-o-meter.js');
s.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);
