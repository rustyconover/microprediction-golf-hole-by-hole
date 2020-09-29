# Import PGA Hole By Hole Tournament Events to Microprediction

This module imports the hole by hole statistics from the PGA into
[microprediction.org](https://www.microprediction.org).

There is a unique stream created for each tournament, course and hole.

The streams are named in the form of:

`golf-hole-by-hole-[TOURNAMENT NAME]-[COURSE NAME]-[HOLE].json`

The values written on the stream correspond to changes to in the columns of:

```js
const shot_values = [
  ["eagles", -2],
  ["birdies", -1],
  ["pars", 0],
  ["bogeys", 1],
  ["doubles", 2],
  ["others", 3],
];
```

So if there is an eagle recorded at a hole a -2 will be written to
the stream, if there is a birdie there is a -1 written.

## Loaded Data

The data is sourced from:

`http://www.espn.com/golf/stats/hole`

## Implementation Details

There is a single Lambda function that is run as a scheduled
CloudWatch Event every minute pull new data. This function
is created using webpack to amalgamate the various imported modules.

The write keys are not included in this repo.
