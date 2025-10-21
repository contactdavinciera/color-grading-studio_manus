{
  "targets": [
    {
      "target_name": "braw",
      "sources": [
        "braw_addon.cpp",
        "BlackmagicRawAPIDispatch.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "/usr/local/include/BlackmagicRAW"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "cflags_cc": [ "-std=c++11" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "libraries": [
        "-lpthread",
        "-ldl"
      ]
    }
  ]
}

