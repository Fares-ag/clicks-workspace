import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/paginated_list_screen.dart';

class FinanceUsersScreen extends StatelessWidget {
  const FinanceUsersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Finance users')),
      body: PaginatedListScreen(
        endpoint: EndPoints.financeUsers,
        emptyMessage: 'No finance users',
        searchHint: 'Search users',
        itemBuilder: (context, item) => ListTile(
          title: Text(item['name']?.toString() ?? item['email']?.toString() ?? 'User'),
          subtitle: Text(item['email']?.toString() ?? ''),
        ),
      ),
    );
  }
}
