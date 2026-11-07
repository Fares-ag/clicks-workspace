import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/components/status_pill.dart';
import '../../core/theme/app_colors.dart';

/// Customer Contact Us tickets, served by the ADMIN API's
/// `GET /api/contact-us` (ops RBAC). The old screen called the customer-only
/// tech-api route (403), read the wrong response key and showed nothing —
/// complaints were saved but nobody could read them (scenario 100).
class SupportTicketsScreen extends StatefulWidget {
  const SupportTicketsScreen({super.key});

  @override
  State<SupportTicketsScreen> createState() => _SupportTicketsScreenState();
}

const Map<String, String> supportTicketStatusLabels = {
  'pending': 'New',
  'in_progress': 'In progress',
  'resolved': 'Resolved',
  'closed': 'Closed',
};

const Map<String, String> supportTicketCategoryLabels = {
  'technical_issue': 'Technical issue',
  'emergency_requests': 'Emergency requests',
  'technician_dispute': 'Technician dispute',
  'billing': 'Billing & payments',
  'general_inquiry': 'General inquiry',
  'other': 'Other',
};

class _SupportTicketsScreenState extends State<SupportTicketsScreen> {
  List<Map<String, dynamic>> _items = [];
  int _total = 0;
  bool _loading = true;
  String? _error;
  String _status = 'all';
  String _category = 'all';
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(
        url: '/contact-us',
        query: {
          'page': 1,
          'limit': 50,
          if (_status != 'all') 'status': _status,
          if (_category != 'all') 'category': _category,
          if (_searchCtrl.text.trim().isNotEmpty) 'search': _searchCtrl.text.trim(),
        },
      );
      if (!mounted) return;
      final data = res.data;
      if (res.statusCode == 200 && data is Map) {
        final list = data['tickets'];
        setState(() {
          _items = list is List
              ? list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
              : [];
          _total = (data['total'] as num?)?.toInt() ?? _items.length;
          _loading = false;
        });
      } else {
        setState(() {
          _error = DioHelper.errorMessage(res) ?? 'Could not load support tickets';
          _loading = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load support tickets';
        _loading = false;
      });
    }
  }

  Future<void> _open(Map<String, dynamic> item) async {
    final id = item['id']?.toString() ?? item['_id']?.toString();
    if (id == null || id.isEmpty) return;
    await Navigator.of(context).pushNamed('/support-tickets/$id');
    if (mounted) _load();
  }

  Widget _filters() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Wrap(
        spacing: 12,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          SizedBox(
            width: 220,
            child: TextField(
              controller: _searchCtrl,
              decoration: const InputDecoration(
                isDense: true,
                hintText: 'Ticket # or phone',
                prefixIcon: Icon(Icons.search, size: 18),
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _load(),
            ),
          ),
          DropdownButton<String>(
            value: _status,
            items: [
              const DropdownMenuItem(value: 'all', child: Text('All statuses')),
              ...supportTicketStatusLabels.entries
                  .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))),
            ],
            onChanged: (v) {
              setState(() => _status = v ?? 'all');
              _load();
            },
          ),
          DropdownButton<String>(
            value: _category,
            items: [
              const DropdownMenuItem(value: 'all', child: Text('All categories')),
              ...supportTicketCategoryLabels.entries
                  .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))),
            ],
            onChanged: (v) {
              setState(() => _category = v ?? 'all');
              _load();
            },
          ),
          Text('$_total ticket${_total == 1 ? '' : 's'}',
              style: const TextStyle(color: AppColors.muted)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Support tickets')),
      body: Column(
        children: [
          _filters(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(_error!),
                              const SizedBox(height: 12),
                              OutlinedButton(onPressed: _load, child: const Text('Retry')),
                            ],
                          ),
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: _items.isEmpty
                            ? ListView(children: const [
                                SizedBox(height: 120),
                                Center(child: Text('No support tickets')),
                              ])
                            : ListView.separated(
                                padding: const EdgeInsets.all(16),
                                itemCount: _items.length,
                                separatorBuilder: (_, __) => const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  final item = _items[index];
                                  final customer = item['customer'] is Map
                                      ? Map<String, dynamic>.from(item['customer'] as Map)
                                      : const <String, dynamic>{};
                                  final status = item['status']?.toString() ?? 'pending';
                                  final replies = (item['reply_count'] as num?)?.toInt() ?? 0;
                                  return ListTile(
                                    onTap: () => _open(item),
                                    title: Text(
                                      '${item['ticket_number'] ?? 'Ticket'} · '
                                      '${item['category_label'] ?? supportTicketCategoryLabels[item['category']] ?? ''}',
                                    ),
                                    subtitle: Text(
                                      [
                                        if ((customer['name'] ?? '').toString().isNotEmpty)
                                          customer['name'],
                                        if ((customer['phone_number'] ?? '').toString().isNotEmpty)
                                          customer['phone_number'],
                                        item['description']?.toString() ?? '',
                                      ].join(' · '),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    trailing: Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        StatusPill(
                                          label: supportTicketStatusLabels[status] ?? status,
                                          status: status == 'pending' ? 'pending' : status,
                                        ),
                                        if (replies > 0)
                                          Text('$replies repl${replies == 1 ? 'y' : 'ies'}',
                                              style: const TextStyle(
                                                  fontSize: 11, color: AppColors.muted)),
                                      ],
                                    ),
                                  );
                                },
                              ),
                      ),
          ),
        ],
      ),
    );
  }
}
