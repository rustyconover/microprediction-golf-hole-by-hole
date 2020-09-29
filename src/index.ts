import { MicroWriter, MicroWriterConfig } from "microprediction";
import { write_keys } from "./write-keys";
const bent = require("bent");
import * as _ from "lodash";
const get = bent("GET", 200);
import { ScheduledHandler } from "aws-lambda";
import S3 from "aws-sdk/clients/s3";
import * as cheerio from "cheerio";

type ShotTypes =
  | "eagles"
  | "birdies"
  | "pars"
  | "bogeys"
  | "doubles"
  | "others";

const shot_values = new Map<ShotTypes, number>([
  ["eagles", -2],
  ["birdies", -1],
  ["pars", 0],
  ["bogeys", 1],
  ["doubles", 2],
  ["others", 3],
]);

interface GolfHoleData {
  tournament: string;
  course: string;
  hole: number;
  shots: {
    [shot_type in ShotTypes]: number;
  };
}

type Index = "a" | "b" | "c";

async function writeSaved(data: GolfHoleData[]) {
  const s3 = new S3({ region: "us-east-1" });
  try {
    const content = JSON.stringify(data);
    await s3
      .putObject({
        Bucket: "microprediction-lambda",
        Key: "golf-hole-by-hole.json",
        Body: content,
      })
      .promise();
  } catch (e) {
    console.error(`Failed to write: ${e}`);
    return undefined;
  }
}

async function getSaved(): Promise<GolfHoleData[] | undefined> {
  const s3 = new S3({ region: "us-east-1" });
  try {
    const result = await s3
      .getObject({
        Bucket: "microprediction-lambda",
        Key: "golf-hole-by-hole.json",
      })
      .promise();
    if (result.Body) {
      return JSON.parse(result.Body.toString("utf8"));
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const cheerioTableparser = require("cheerio-tableparser");
async function getCurrentData(): Promise<GolfHoleData[]> {
  const result = await get("http://www.espn.com/golf/stats/hole");

  const body = await result.text();

  const $ = cheerio.load(body);

  // Get the selected tournament.
  const tournament = $('select[name="tournaments"] option:selected ').text();
  const course = $('select[name="course"] option:selected ').text();

  cheerioTableparser($);

  const table = $("table.tablehead");

  // @ts-ignore
  const d: Array<Array<string>> = table.parsetable(false, false, true);

  for (const l of d) {
    l.shift();
  }

  // Holes are listed first.
  const hole_list = d.shift();
  if (hole_list == null) {
    throw new Error("Didn't get the hole list");
  }

  const wanted_fields: { [name: string]: ShotTypes } = {
    EAGLES: "eagles",
    BIRDIES: "birdies",
    PARS: "pars",
    BOGEYS: "bogeys",
    DOUBLES: "doubles",
    OTHERS: "others",
  };

  const shot_type_to_index = new Map<ShotTypes, number>();

  d.forEach((l, idx) => {
    const s = wanted_fields[l[0]];
    if (s != null) {
      shot_type_to_index.set(s, idx);
    }
    l.shift();
  });

  hole_list.shift();

  const all_holes = hole_list.map((hole_number, hole_idx) => {
    const hole = parseInt(hole_number, 10);

    const shot_data: Partial<GolfHoleData["shots"]> = {};

    for (const [shot_type, idx] of shot_type_to_index.entries()) {
      const value = d[idx][hole_idx];
      shot_data[shot_type] = parseInt(value, 10);
    }

    const hole_data: GolfHoleData = {
      tournament,
      course,
      hole,
      shots: shot_data as GolfHoleData["shots"],
    };

    return hole_data;
  });

  return all_holes;
}

async function calculateGolfHoleChanges() {
  const current = await getCurrentData();
  const old = await getSaved();

  const old_write = writeSaved(current);

  if (old == null) {
    console.log("No golf hole data previously saved, so ignoring");
    return;
  }

  const writes = [];

  for (const r of current) {
    // Find the old record.
    const old_hole_record = old.find((s) => {
      return (
        s.tournament === r.tournament &&
        s.course === r.course &&
        s.hole === r.hole
      );
    });
    if (old_hole_record == null) {
      console.error(`Did not find old info for ${JSON.stringify(r)}`);
      continue;
    }

    const stream_values: number[] = [];
    for (const [shot_name, v] of shot_values.entries()) {
      const d = old_hole_record.shots[shot_name] - r.shots[shot_name];

      for (let i = 0; i < d; i++) {
        stream_values.push(v);
      }
    }

    if (stream_values.length > 0) {
      const write_key_name = `${r.tournament}|${r.course}|${r.hole}`;
      const write_key = write_keys[r.tournament]?.[r.course]?.[r.hole - 1];
      if (write_key == null) {
        console.error(`No write key defined for ${write_key_name}`);
        continue;
      }

      // Send the stream values to Microprediction for this hole.
      let config = await MicroWriterConfig.create({
        write_key,
      });
      const writer = new MicroWriter(config);
      console.log("Writing", name);
      const pretty_string = (v: string) => v.replace(/ /g, "-").toLowerCase();
      const stream_name = `golf-hole-by-hole-${pretty_string(
        r.tournament
      )}-${pretty_string(r.course)}-${r.hole}.json`;
      for (const v of stream_values) {
        writes.push(writer.set(stream_name, v));
      }
    }
  }

  await Promise.all([...writes, old_write]);
}

export const handler: ScheduledHandler<any> = async (event) => {
  await calculateGolfHoleChanges();
};
