#!/usr/bin/env node

import fs from 'fs';
import getopts from 'getopts';
import axios from 'axios';
import * as stream from 'stream';
import { promisify } from 'util';
import createPrompt from 'prompt-sync';
import path from 'path';
import sleep from 'es7-sleep';

// @see https://download.seafile.com/published/web-api/v2.1/file.md#user-content-Download%20File
// @see https://download.seafile.com/published/web-api/v2.1/directories.md#user-content-Download%20Directory
// @see https://download.seafile.com/published/web-api/v2.1/files-directories-batch-op.md#user-content-Download%20Multiple%20Items

// @TODO manage smart-links https://lab.plantnet.org/seafile/smart-link/2e74e65c-697b-41e4-b9c5-693b290adb78/

const options = getopts(process.argv.slice(2), {
    alias: {
        host: "h",
        username: "u",
        password: "p",
        file: "f",
        directory: "d",
        list: "l",
        output: "o"
    },
    string: ["h", "u", "p", "f", "d", "l", "o"]
});

if (!options.username || (!options.file && !options.directory && !options.list)) {
    usage();
    process.exit(1);
}

// output directory
if (options.output) {
    try {
        fs.accessSync(options.output, fs.constants.W_OK);
        // remove trailing slash if any
        options.output = options.output.replace(/\/$/, '');
    } catch (err) {
        console.error(`output directory ${options.output} does not exist or is not writable`);
        process.exit(4);
    }
} else {
    options.output = '.'
}

function usage() {
    console.log(`usage: ./seafile-rmdsm -h seafile_root_URL -u username [-p password] ([-f file_URL_or_path] | [-d directory_URL_or_path] | [-l list_of_file_URLs.txt])

examples:
    ./seafile-rmdsm.js -h https://lab.plantnet.org/seafile -u random.guy@inria.fr -f https://lab.plantnet.org/seafile/lib/e8092829-fee6-49f1-b31f-433e96576267/file/manif-sandwich.jpg
    ./seafile-rmdsm.js -h https://lab.plantnet.org/seafile -u random.guy@inria.fr -p 12345 -d https://lab.plantnet.org/seafile/library/b89cd242-2c7b-448b-af53-e862ab75ef64/ImageDatasets/Quadrats/CBNMedQuadrats
    ./seafile-rmdsm.js -h https://lab.plantnet.org/seafile -u random.guy@inria.fr -l ./files-list.txt -o ~/Downloads/seafile/foo
`);
}

// ask for password
const prompt = createPrompt({});
if (!options.password) {
    options.password = prompt.hide('password: ');
}

// remove trailing slash if any
options.host = options.host.replace(/\/$/, '');
const api2URL = options.host + '/api2';
const apiv21URL = options.host + '/api/v2.1';

async function main() {

    let authTokenURL = api2URL + '/auth-token/'; // keep trailing slash (important)
    const { data } = await axios.post(
        authTokenURL,
        {
            username: options.username,
            password: options.password
        },
        {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        }
    );
    const token = data.token;
    // console.log('token', token);

    // detect what to download
    if (options.file) {
        await downloadSingleFile(options.file, token);
    } else if (options.directory) {
        await downloadDirectory(options.directory, token);
    } else if (options.list) {
        await downloadFilesList(options.list, token);
    } else {
        console.error('wtf');
        process.exit(3);
    }
}

async function downloadSingleFile(url, token) {
    // DEBUG
    // url = 'https://lab.plantnet.org/seafile/lib/e8092829-fee6-49f1-b31f-433e96576267/file/Sous%20r%C3%A9pertoire%20bien%20poucrave%20du%20Cul%20!/openfortigui_0.9.8-1_amd64_jammy.deb';
    // url = '/lib/e8092829-fee6-49f1-b31f-433e96576267/file/Sous%20r%C3%A9pertoire%20bien%20poucrave%20du%20Cul%20!/openfortigui_0.9.8-1_amd64_jammy.deb';
    // url = 'lib/e8092829-fee6-49f1-b31f-433e96576267/file/Sous%20r%C3%A9pertoire%20bien%20poucrave%20du%20Cul%20!/openfortigui_0.9.8-1_amd64_jammy.deb';
    // url = 'https://lab.plantnet.org/seafile/lib/e8092829-fee6-49f1-b31f-433e96576267/file/manif-sandwich.jpg';
    // url = '/lib/e8092829-fee6-49f1-b31f-433e96576267/file/manif-sandwich.jpg';
    // url = 'lib/e8092829-fee6-49f1-b31f-433e96576267/file/manif-sandwich.jpg';
    // console.log('URL', url);

    const regexp = new RegExp('^(' + options.host.replace(/\//g, '\/').replace(/\./g, '\.') + ')?\/?lib\/([^\/]+)\/file\/(.+)$');
    const matches = url.match(regexp);
    // console.log('matches', matches.length, matches);
    if (matches.length < 4) {
        throw new Error('could not parse single file URL');
    }
    const repoId = matches[2];
    const filePath = matches[3];
    // console.log(`downloading file [${filePath}] from library [${repoId}]`);

    // get one-time direct download URL
    const fileLinkURL = api2URL + '/repos/' + repoId + '/file/?p=/' + filePath + '&reuse=0';
    const { data } = await axios.get(
        fileLinkURL,
        {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': 'Token ' + token,
                'Accept': 'application/json; charset=utf-8; indent=4'
            }
        }
    );
    const fileDownloadURL = data;
    // console.log('file download URL', fileDownloadURL);

    // stream download
    const fileName = path.basename(filePath);
    const fileWriteLocation = options.output + '/' + fileName;
    console.log (`downloading to ${fileWriteLocation}`);
    const finishedDownload = promisify(stream.finished);
    const writer = fs.createWriteStream(fileWriteLocation);
    const response = await axios({
        method: 'GET',
        url: fileDownloadURL,
        responseType: 'stream',
    });
    response.data.pipe(writer);
    await finishedDownload(writer);
}

async function downloadDirectory(url, token) {
    // DEBUG
    // url = 'https://lab.plantnet.org/seafile/library/b89cd242-2c7b-448b-af53-e862ab75ef64/ImageDatasets/Quadrats/CBNMedQuadrats';
    // url = 'https://lab.plantnet.org/seafile/library/b89cd242-2c7b-448b-af53-e862ab75ef64/ImageDatasets/Quadrats/CBNMedQuadrats/Combes%20a%20neige';
    // url = 'https://lab.plantnet.org/seafile/library/e8092829-fee6-49f1-b31f-433e96576267/Ma%20biblioth%C3%A8que/Sous%20r%C3%A9pertoire%20bien%20poucrave%20du%20Cul%20!';
    // url = 'https://lab.plantnet.org/seafile/library/e8092829-fee6-49f1-b31f-433e96576267/Ma%20biblioth%C3%A8que/Dossier%20interm%C3%A9diaire/Sous%20r%C3%A9pertoire%20bien%20poucrave%20du%20Cul%20!';

    const regexp = new RegExp('^(' + options.host.replace(/\//g, '\/').replace(/\./g, '\.') + ')?\/?lib(rary)?\/([^\/]+)\/[^\/]+(\/.+?)?\/([^\/]+)$');
    const matches = url.match(regexp);
    // console.log('matches', matches.length, matches);
    if (!matches || matches.length < 6) {
        throw new Error('could not parse directory URL');
    }
    const repoId = matches[3];
    const parentDir = decodeURIComponent(matches[4]) || '/';
    const dirName = decodeURIComponent(matches[5]);
    console.log(`downloading directory [${dirName}] from library [${repoId}]`);

    // console.log('parent dir', parentDir);
    // console.log('dir name', dirName);

    // trigger zip task and get zip progress token
    const fileLinkURL = apiv21URL + '/repos/' + repoId + '/zip-task/';
    const { data } = await axios.post(
        fileLinkURL,
        {
            parent_dir: parentDir,
            dirents: dirName
        },
        {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': 'Token ' + token,
                'Accept': 'application/json; charset=utf-8; indent=4'
            }
        }
    );
    const zipToken = data.zip_token;
    // console.log('zip token', zipToken);

    // process.exit(6);

    // wait for zip task to be done
    let zipTaskDone = false;
    let progress;
    while (!zipTaskDone) {
        // get zip task progress
        const fileLinkURL = apiv21URL + '/query-zip-progress/?token=' + zipToken;
        const { data } = await axios.get(
            fileLinkURL,
            {
                headers: {
                    'Authorization': 'Token ' + token
                }
            }
        );
        progress = data;
        // console.log('progress:', progress);
        const percent = (progress.zipped * 100 / progress.total);
        console.log(`zipping… ${percent.toFixed(0)} % (${progress.zipped}/${progress.total})`); // @TODO use readline
        zipTaskDone = (progress.zipped == progress.total || progress.failed > 0 || progress.canceled == 1);
        if (! zipTaskDone) {
            await sleep(1000);
        }
    }

    if (!progress || progress.failed > 0) {
        throw new Error(`zip task failed: ${progress.failed_reason}`);
    }
    if (!progress || progress.canceled == 1) {
        throw new Error(`zip task canceled`);
    }

    // zip stream download
    const zipDownloadURL = options.host + '/seafhttp/zip/' + zipToken;
    const fileName = dirName + '.zip';
    const fileWriteLocation = options.output + '/' + fileName;
    console.log (`downloading to ${fileWriteLocation}`);
    const finishedDownload = promisify(stream.finished);
    const writer = fs.createWriteStream(fileWriteLocation);
    const response = await axios({
        method: 'GET',
        url: zipDownloadURL,
        responseType: 'stream',
    });
    response.data.pipe(writer);
    await finishedDownload(writer);
}

async function downloadFilesList(listPath, token) {
    const listData = fs.readFileSync(listPath, { encoding: 'UTF-8' });
    let lines = listData.split('\n');
    lines = lines.filter((l) => !!l);
    // console.log(lines);
    let i = 1;
    for (const fileURL of lines) {
        console.log(`processing file ${i}/${lines.length}`);
        try {
            await downloadSingleFile(fileURL, token);
        } catch (err) {
            console.error(`failed to download [${fileURL}]`);
        }
        i++;
    }
}

main().then(() => {
    console.log('done');
}).catch((err) => {
    console.error(err?.response?.data || err?.response || err);
    process.exit(2);
});
