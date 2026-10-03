import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

/// Renders technician home hero from network URL or inline data URL (Azure fallback).
class HomeHeroImage extends StatelessWidget {
  const HomeHeroImage({
    super.key,
    required this.url,
    required this.fallbackAsset,
    this.fit = BoxFit.cover,
    this.cacheWidth,
    this.cacheHeight,
  });

  final String url;
  final String fallbackAsset;
  final BoxFit fit;
  final int? cacheWidth;
  final int? cacheHeight;

  static String _baseUrl(String raw) {
    if (raw.startsWith('data:')) {
      final q = raw.indexOf('?v=');
      final amp = raw.indexOf('&v=');
      final cut = q >= 0 ? q : (amp >= 0 ? amp : -1);
      return cut >= 0 ? raw.substring(0, cut) : raw;
    }
    return raw;
  }

  static Uint8List? _decodeDataUrl(String raw) {
    final dataUrl = _baseUrl(raw);
    if (!dataUrl.startsWith('data:')) return null;
    final comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    try {
      return base64Decode(dataUrl.substring(comma + 1));
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _decodeDataUrl(url);
    if (bytes != null && bytes.isNotEmpty) {
      return Image.memory(
        bytes,
        key: ValueKey(url),
        fit: fit,
        cacheWidth: cacheWidth,
        cacheHeight: cacheHeight,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => Image.asset(
          fallbackAsset,
          fit: fit,
          cacheWidth: cacheWidth,
          cacheHeight: cacheHeight,
        ),
      );
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return Image.network(
        url,
        key: ValueKey(url),
        fit: fit,
        cacheWidth: cacheWidth,
        cacheHeight: cacheHeight,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => Image.asset(
          fallbackAsset,
          fit: fit,
          cacheWidth: cacheWidth,
          cacheHeight: cacheHeight,
        ),
      );
    }

    return Image.asset(
      fallbackAsset,
      fit: fit,
      cacheWidth: cacheWidth,
      cacheHeight: cacheHeight,
    );
  }
}
