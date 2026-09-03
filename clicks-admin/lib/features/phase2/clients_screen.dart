import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/paginated_list_screen.dart';

class ClientsScreen extends StatelessWidget {
  const ClientsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Clients')),
      body: PaginatedListScreen(
        endpoint: EndPoints.customers,
        emptyMessage: 'No clients',
        searchHint: 'Search clients',
        itemBuilder: (context, item) {
          final name =
              '${item['first_name'] ?? item['firstName'] ?? ''} ${item['last_name'] ?? item['lastName'] ?? ''}'
                  .trim();
          return ListTile(
            title: Text(name.isEmpty ? 'Client' : name),
            subtitle: Text(item['phone_number']?.toString() ?? item['phone']?.toString() ?? ''),
          );
        },
      ),
    );
  }
}
