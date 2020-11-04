// Copyright (c) 2020 PaperCut Software Int Pty Ltd
// http://www.papercut.com/
// Author: Chris Dance (codedance @ GitHub)

// Inject our script into the Google Meet page
var s = document.createElement('script')
s.src = chrome.extension.getURL('talkshare.js')
document.body.appendChild(s)