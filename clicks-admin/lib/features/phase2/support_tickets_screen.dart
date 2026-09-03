import 'package:flutter/material.dart';

import 'package:dio/dio.dart';

import '../../core/config/app_config.dart';
import '../../core/helper/cache_helper.dart';

/// Support tickets are served from tech-api `/api/contact-us` in production.
class SupportTicketsScreen extends StatefulWidget {
  const SupportTicketsScreen({super.key});

  @override
  State<SupportTicketsScreen> createState() => _SupportTicketsScreenState();
}

class _SupportTicketsScreenState extends State<SupportTicketsScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final token = CacheHelper.getAuthToken();
      final dio = Dio(
        BaseOptions(
          baseUrl: '${AppConfig.socketUrl}/api',
          headers: {
            if (token != null && token.isNotEmpty)
              'Authorization': 'Bearer $token',
          },
        ),
      );
      final res = await dio.get('/contact-us', queryParameters: {
        'page': 1,
        'limit': 50,
      });
      if (res.statusCode == 200) {
        final data = res.data;
        List<Map<String, dynamic>> items = [];
        if (data is Map) {
          final list = data['tickets'] ?? data['items'] ?? data['data'];
          if (list is List) {
            items = list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          }
        } else if (data is List) {
          items = data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        }
        setState(() {
          _items = items;
          _loading = false;
        });
      } else {
        setState(() {
          _error =
              'Support tickets require tech-api proxy. Open web admin at ${AppConfig.apiBaseUrl}';
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Could not load support tickets from mobile API';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Support tickets')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _items.length,
                    itemBuilder: (context, index) {
                      final item = _items[index];
                      return ListTile(
                        title: Text(item['subject']?.toString() ?? 'Ticket'),
                        subtitle: Text(item['status']?.toString() ?? ''),
                      );
                    },
                  ),
                ),
    );
  }
}
