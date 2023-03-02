# seafile-rmdsm
(rends-moi mes données, sal*perie de machine)

## about

A CLI program for non-interactive retrieval of files and folders from Seafile, using Seafile HTTP API

## install

```sh
npm install
```

## usage

```sh
./seafile-rmdsm.js -h seafile_root_URL -u username [-p password] ([-f file_URL_or_path] | [-d directory_URL_or_path] | [-l list_of_file_URLs.txt])
```

## examples

Download a single file:
```sh
./seafile-rmdsm.js -h https://lab.plantnet.org/seafile -u random.guy@inria.fr -f https://lab.plantnet.org/seafile/lib/e8092829-fee6-49f1-b31f-433e96576267/file/manif-sandwich.jpg
```

Download a single directory:
```sh
./seafile-rmdsm.js -h https://lab.plantnet.org/seafile -u random.guy@inria.fr -p 12345 -d https://lab.plantnet.org/seafile/library/b89cd242-2c7b-448b-af53-e862ab75ef64/ImageDatasets/Quadrats/CBNMedQuadrats
```

Download a list of files:
```sh
./seafile-rmdsm.js -h https://lab.plantnet.org/seafile -u random.guy@inria.fr -l ./files-list.txt -o ~/Downloads/seafile/foo
```
