import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/api/end_points.dart';
import '../../core/components/paginated_list_screen.dart';
import 'membership_actions.dart';

class CustomerMembershipsScreen extends StatefulWidget {
  const CustomerMembershipsScreen({super.key});

  @override
  State<CustomerMembershipsScreen> createState() => _CustomerMembershipsScreenState();
}

class _CustomerMembershipsScreenState extends State<CustomerMembershipsScreen> {
  var _refreshTick = 0;

  String _subtitle(Map<String, dynamic> item) {
    final phone = (item['customer'] is Map)
        ? (item['customer']['phone']?.toString() ?? '')
        : '';
    final plate = (item['vehicle'] is Map)
        ? (item['vehicle']['plate']?.toString() ?? '')
        : '';
    final interval = item['interval']?.toString() ?? '';
    final end = item['endDate']?.toString() ?? '';
    final flags = [
      if (item['comp'] == true) 'comp',
      if (item['cancel_at_period_end'] == true) 'ends at period end',
    ].join(', ');
    return [phone, plate, interval, end, flags].where((s) => s.isNotEmpty).join(' · ');
  }

  void _refresh() => setState(() => _refreshTick += 1);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          if (await MembershipActions.grant(context)) _refresh();
        },
        icon: const Icon(Icons.card_giftcard),
        label: const Text('Grant'),
      ),
      body: PaginatedListScreen(
        endpoint: EndPoints.customerSubscriptions,
        emptyMessage: 'No customer memberships',
        searchHint: 'Search plan name',
        refreshTick: _refreshTick,
        itemBuilder: (context, item) {
          return ListTile(
            title: Text(
              '${item['planName'] ?? item['planCode'] ?? 'Plan'} · ${item['status'] ?? ''}',
              style: GoogleFonts.dmSans(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(_subtitle(item)),
            trailing: const Icon(Icons.more_vert),
            onTap: () async {
              if (await MembershipActions.openFor(context, item)) _refresh();
            },
          );
        },
      ),
    );
  }
}
