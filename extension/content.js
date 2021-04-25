// Copyright (c) 2020 PaperCut Software Int Pty Ltd
// http://www.papercut.com/
// Author: Chris Dance ( https://github.com/codedance )

// Inject our script into the Google Meet page
const scriptInject = document.createElement('script');

scriptInject.src = chrome.extension.getURL('talk-o-meter.js');
document.body.appendChild(scriptInject);
