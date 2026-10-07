/* Measured alpha bounds [left, top, width, height]. Views are distinct drawings. */
(function(root){ const assets = [
  {
    "id": "leaf",
    "name": "잎 친구",
    "poses": {
      "stand": {
        "file": "materials/working/v001/leaf-stand.png",
        "bounds": [
          59,
          105,
          1113,
          1008
        ],
        "size": [
          1254,
          1254
        ]
      },
      "sit": {
        "file": "materials/working/v001/leaf-sit.png",
        "bounds": [
          84,
          106,
          1099,
          1036
        ],
        "size": [
          1254,
          1254
        ]
      },
      "sleep": {
        "file": "materials/working/v001/leaf-sleep.png",
        "bounds": [
          87,
          308,
          1122,
          723
        ],
        "size": [
          1254,
          1254
        ]
      }
    },
    "views": {
      "stand": {
        "front": {
          "file": "materials/working/v002/leaf-stand-front.png",
          "bounds": [
            47,
            123,
            1138,
            1001
          ],
          "size": [
            1254,
            1254
          ]
        },
        "left": {
          "file": "materials/working/v002/leaf-stand-left.png",
          "bounds": [
            125,
            96,
            1075,
            1043
          ],
          "size": [
            1254,
            1254
          ]
        },
        "head-right": {
          "file": "materials/working/v003/leaf-head-right.png",
          "bounds": [
            55,
            96,
            1124,
            1037
          ],
          "size": [
            1254,
            1254
          ]
        },
        "head-left": {
          "file": "materials/working/v003/leaf-head-left.png",
          "bounds": [
            41,
            79,
            1141,
            1059
          ],
          "size": [
            1254,
            1254
          ]
        }
      },
      "sit": {
        "front": {
          "file": "materials/working/v002/leaf-sit-front.png",
          "bounds": [
            61,
            128,
            1116,
            1041
          ],
          "size": [
            1254,
            1254
          ]
        },
        "left": {
          "file": "materials/working/v002/leaf-sit-left.png",
          "bounds": [
            119,
            57,
            1064,
            1126
          ],
          "size": [
            1254,
            1254
          ]
        }
      }
    }
  },
  {
    "id": "wing",
    "name": "날개 친구",
    "poses": {
      "stand": {
        "file": "materials/working/v001/wing-stand.png",
        "bounds": [
          101,
          124,
          1106,
          1033
        ],
        "size": [
          1254,
          1254
        ]
      },
      "sit": {
        "file": "materials/working/v001/wing-sit.png",
        "bounds": [
          94,
          59,
          1136,
          1116
        ],
        "size": [
          1254,
          1254
        ]
      },
      "sleep": {
        "file": "materials/working/v001/wing-sleep.png",
        "bounds": [
          53,
          379,
          1165,
          698
        ],
        "size": [
          1254,
          1254
        ]
      }
    },
    "views": {
      "stand": {
        "front": {
          "file": "materials/working/v002/wing-stand-front.png",
          "bounds": [
            92,
            74,
            1070,
            1110
          ],
          "size": [
            1254,
            1254
          ]
        },
        "left": {
          "file": "materials/working/v002/wing-stand-left.png",
          "bounds": [
            62,
            82,
            1146,
            1090
          ],
          "size": [
            1254,
            1254
          ]
        },
        "head-left": {
          "file": "materials/working/v003/wing-head-left.png",
          "bounds": [
            147,
            53,
            1023,
            1134
          ],
          "size": [
            1254,
            1254
          ]
        },
        "head-right": {
          "file": "materials/working/v003/wing-head-right.png",
          "bounds": [
            126,
            72,
            1029,
            1113
          ],
          "size": [
            1254,
            1254
          ]
        }
      },
      "sit": {
        "front": {
          "file": "materials/working/v002/wing-sit-front.png",
          "bounds": [
            102,
            47,
            1050,
            1147
          ],
          "size": [
            1254,
            1254
          ]
        },
        "left": {
          "file": "materials/working/v002/wing-sit-left.png",
          "bounds": [
            166,
            76,
            1048,
            1102
          ],
          "size": [
            1254,
            1254
          ]
        }
      }
    }
  }
]; if(typeof module!=="undefined" && module.exports) module.exports=assets; else root.AppearanceAssets=assets; })(globalThis);
