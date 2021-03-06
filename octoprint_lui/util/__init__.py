# coding=utf-8
from __future__ import absolute_import

import watchdog
import watchdog.events

import socket
import urllib2
import json
import logging

from octoprint.filemanager import LocalFileStorage
from .exceptions import ScriptError

class CallbackFileSystemWatch(watchdog.events.FileSystemEventHandler):

    def __init__(self, callback):
        watchdog.events.FileSystemEventHandler.__init__(self)
        self.callback = callback

    def on_any_event(self, event):
        self.callback(event)

class UsbFileStorage(LocalFileStorage):

    @property
    def analysis_backlog(self):
        return []

    def _sanitize_entry(self, entry, path, entry_path):
        return entry, entry_path
    
def is_online(host="8.8.8.8", port=53, timeout=3):
    """
    Host: 8.8.8.8 (google-public-dns-a.google.com)
    OpenPort: 53/tcp
    Service: domain (DNS/TCP)
    """
    logger = logging.getLogger("octoprint.plugins.lui.util")

    try:
        socket.setdefaulttimeout(timeout)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((host, port))
        return True
    except Exception as ex:
        logger.debug(ex)
        return False

def github_online():
    """ 
    Checks the status of github server from the github status pi.
    returns True if status is good or minor, returns false if its major
    """
    logger = logging.getLogger("octoprint.plugins.lui.util")

    github_status_api = 'https://status.github.com/api/status.json'
    try:
        response = urllib2.urlopen(github_status_api)
        data = json.load(response)
        if data['status'] == 'good' or data['status'] == 'minor':
            return True
        else:
            return False
    except urllib2.URLError as ex:
        logger.debug(ex)
        return False

def execute(command, cwd=None, evaluate_returncode=True):
    import sarge
    p = None

    try:
        p = sarge.run(command, cwd=cwd, stdout=sarge.Capture(), stderr=sarge.Capture(), shell=True)
    except:
        returncode = p.returncode if p is not None else None
        stdout = p.stdout.text if p is not None and p.stdout is not None else ""
        stderr = p.stderr.text if p is not None and p.stderr is not None else ""
        raise ScriptError(returncode, stdout, stderr)

    if evaluate_returncode and p.returncode != 0:
        raise ScriptError(p.returncode, p.stdout.text, p.stderr.text)

    return p.returncode, p.stdout.text, p.stderr.text
