# node-logger
Simple yet powerful logger. Logs to file and/or console, different loglevels, logs date, logs origin file, logs errors with stack trace, ...

## Installation

```bash
npm install HardwareProjects/node-logger --save
```

To use the logger, copy the `node-logger.json` file to the base directory of your node app. Do not rename the file.

## Usage

```js
let log = Logger.createFromConfigFile();
let isInfo = log.isInfoOrVerboser();

isInfo && log.info("Checking isInfo prevents expensive argument evaluation if not needed. Note that the filename where the logger was created is included as a tag. %j", util.inspect(log));
// {"isoDate":"2016-04-28T22:27:15.868Z","level":"INFO","tags":["test.js"],"text":"Checking isInfo prevents expensive argument evaluation if not needed. Note that the filename where the logger was created is included as a tag. \"Logger { <inspect result>"}

log.info2(["functional_warning"], "This message includes a tag, so it can be easily filtered.\n Note that there is always exactly one output line per message.");
// {"isoDate":"2016-04-28T22:27:15.869Z","level":"INFO","tags":["test.js","functional_warning"],"text":"This message includes a tag, so it can be easily filtered.\n Note that there is always exactly one output line per message."}

let touchFeatureLog = Logger.createFromConfigFile(["touch_feature"]);
touchFeatureLog.error(new Error("Messages form this logger will have the tags specified during creation. Note that all log-functions return promises."))
    .then(() => process.exit());
// {"isoDate":"2016-04-28T22:27:15.871Z","level":"ERROR","tags":["test.js","touch_feature"],"text":"[Error: Messages form this logger will have the tags specified during creation. Note that all log-functions return promises.]","stack":"Error: Messages form this logger will have the tags specified during creation. Note that all log-functions return promises.\n    at  <full stack trace>"}
```
