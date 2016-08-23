"use strict";

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("resource://gre/modules/Services.jsm");

function makeLoginInfo(data) {
  var info = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  for (let field of Object.keys(data)) {
    info[field] = data[field];
  }
  return info;
}

// record is a simple js object from the extension api, info is an nsILoginInfo
// accounts for field name differences
function checkRecord(record, info) {
  equal(record.formSubmitURL, info.formSubmitURL);
  equal(record.origin, info.hostname);
  equal(record.realm, info.httpRealm);
  equal(record.username, info.username);
  equal(record.password, info.password);
  equal(record.usernameField, info.usernameField);
  equal(record.passwordField, info.passwordField);
}

function loadApiExtension() {
  notEqual(_TEST_FILE, undefined, "_TEST_FILE is set");
  let testFile = new FileUtils.File(_TEST_FILE);
  equal(testFile.isSymlink(), true, "_TEST_FILE is a symlink");
  testFile = new FileUtils.File(testFile.target);
  // testFile.target should be this file, so its parent is the test
  // directory and parent.parent is the top level for the api extension
  let apiExtensionDir = testFile.parent.parent;
  do_print(`mapped test file ${_TEST_FILE} to api extension directory ${apiExtensionDir.path}\n`);

  return AddonManager.installTemporaryAddon(apiExtensionDir);
}

add_task(function* test_logins() {
  yield ExtensionTestUtils.startAddonManager();

  let apiExtension = yield loadApiExtension();

  function background() {
    browser.test.onMessage.addListener(function(msg, ...args) {
      if (msg == "search.request") {
        browser.logins.search(args[0]).then(results => {
          browser.test.sendMessage("search.done", {results});
        });
      }
    });
    browser.test.sendMessage("ready");
  }

  function search(ext, options) {
    let promise = ext.awaitMessage("search.done");
    ext.sendMessage("search.request", options);
    return promise;
  }

  let privilegedExtension = ExtensionTestUtils.loadExtension({
    background,
    manifest: {
      permissions: ["experiments.logins", "logins", "<all_urls>"],
    },
  });

  let unprivilegedExtension = ExtensionTestUtils.loadExtension({
    background,
    manifest: {
      permissions: ["experiments.logins", "logins"],
    },
  });

  yield privilegedExtension.startup();
  yield unprivilegedExtension.startup();
  yield privilegedExtension.awaitMessage("ready");
  yield unprivilegedExtension.awaitMessage("ready");

  // Initially, we shouldn't see anything
  let response = yield search(privilegedExtension, {});
  equal(response.results.length, 0);
  response = yield search(unprivilegedExtension, {});
  equal(response.results.length, 0);

  // Add one login record
  let record = {
    formSubmitURL: "https://test.mozilla.com/testpage",
    hostname: "https://test.mozilla.com/",
    username: "user",
    password: "password",
    usernameField: "usernameField",
    passwordField: "passwordField",
  };
  let info = makeLoginInfo(record);
  Services.logins.addLogin(info);

  // The unprivileged extension should not be able to see it
  response = yield search(unprivilegedExtension, {});
  equal(response.results.length, 0);

  // The privileged extension should be able to see it
  response = yield search(privilegedExtension, {});
  equal(response.results.length, 1);
  checkRecord(response.results[0], info);

  // And it should see it with a targeted search too
  response = yield search(privilegedExtension, {username: "user"});
  equal(response.results.length, 1);
  checkRecord(response.results[0], info);

  // But with non-matching search terms we should not see it
  response = yield search(privilegedExtension, {username: "somebodyelse"});
  equal(response.results.length, 0);

  // XXX test other fields, combinations

  yield privilegedExtension.unload();
  yield unprivilegedExtension.unload();
  apiExtension.uninstall();
});

// XXX test store(), remove()
