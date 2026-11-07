import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/components/admin_card.dart';
import '../../core/components/admin_detail_header.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/config/app_config.dart';
import '../../core/helper/cache_helper.dart';

class SupportTicketDetailScreen extends StatefulWidget {
  const SupportTicketDetailScreen({super.key, required this.ticketId});
  final String ticketId;

  @override
  State<SupportTicketDetailScreen> createState() => _SupportTicketDetailScreenState();
}

class _SupportTicketDetailScreenState extends State<SupportTicketDetailScreen> {
  Map<String, dynamic>? _ticket;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = CacheHelper.getAuthToken();
    final dio = Dio(
      BaseOptions(
        baseUrl: '${AppConfig.socketUrl}/api',
        headers: {if (token != null) 'Authorization': 'Bearer $token'},
      ),
    );
    final res = await dio.get('/contact-us/${widget.ticketId}');
    if (!mounted) return;
    if (res.statusCode == 200 && res.data is Map) {
      final data = res.data as Map;
      setState(() {
        _ticket = Map<String, dynamic>.from((data['ticket'] ?? data) as Map);
        _loading = false;
      });
    } else {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AdminLoadingState(message: 'Loading ticket…');
    final t = _ticket;
    if (t == null) return const Center(child: Text('Ticket not found'));

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: t['subject']?.toString() ?? 'Support ticket',
          subtitle: t['email']?.toString(),
        ),
        AdminCard(
          child: Text(t['message']?.toString() ?? t['body']?.toString() ?? '—'),
        ),
      ],
    );
  }
}
